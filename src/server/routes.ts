import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { readFile } from 'node:fs/promises';
import path from 'path';
import { buildGraph } from '../graph/app.js';
import { buildLessonGraph } from '../graph/lessonGraph.js';
import { logger, snapshotMetrics } from '../utils/observability.js';
import { lessonManager, Topic } from '../services/lessonManager.js';
// narrow helper para evitar any quando checamos método experimental
interface LessonManagerWithFlush { flushEndTopicAnswers?: (limit?: number) => Promise<void> }
// NodeNext exige extensão explícita em import local TS
// eslint-disable-next-line import/no-unresolved
import { ragAgent } from '../agents/rag.js';

// eslint-disable-next-line import/no-unresolved
import { determineRoute, heuristicIrrelevance, cacheIrrelevanceGet, cacheIrrelevanceSet } from './classifierHeuristics.js';

// inicializa grafo de lições uma vez
buildLessonGraph();

export async function registerRoutes(app: FastifyInstance, graph: ReturnType<typeof buildGraph>) {
  app.get('/health', async () => ({ status: 'ok' }));

  app.post('/events', async (request, reply) => {
    try {
  const body = request.body as { type?: string; todo?: unknown };
      let result;
      if (body?.type === 'todo') {
        const raw = Array.isArray(body.todo) ? body.todo as Topic[] : [];
        const normalized = raw.map(t => ({ id: t.id, title: t.title, done: false, subtasks: (t.subtasks||[]).map(s => ({ id: s.id, title: s.title, done: false })) }));
        result = await graph.invoke({ todo: normalized });
      } else if (body?.type === 'message') {
        result = await graph.invoke({ questionsQueue: [] });
      } else if (body?.type === 'build_course') {
        const todo = Array.isArray(body.todo) ? body.todo as Topic[] : [];
        const lessonResult = await lessonManager.init(todo);
        result = lessonResult;
      } else if (body?.type === 'next_section') {
        const lessonResult = await lessonManager.next();
        result = lessonResult;
      } else {
        logger.warn({ event: 'unknown_event_type', body });
        return reply.status(400).send({ error: 'invalid event type' });
      }
      logger.info({ event: 'graph_invoke_success', result });
      return reply.send({ ok: true, result });
    } catch (error) {
      const err = error as Error;
      logger.error({ event: 'graph_invoke_error', error: err.message, stack: err.stack });
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  app.get('/metrics', async () => snapshotMetrics());
  app.get('/metrics/questions', async () => ({ metrics: lessonManager.getMetrics() }));
  app.get('/course/lessons', async () => ({ lessons: lessonManager.getState().lessons, done: lessonManager.getState().done }));

  // Chat endpoints (fase 2 - MVP julgamento simples)
  app.post('/chat/send', async (request, reply) => {
    try {
      const body = (request.body as { text?: string; message?: string; from?: string; forceRoute?: string }) || {};
      const userText = body.text || body.message;
      if (!userText) return reply.status(400).send({ error: 'text_required' });
      const q = lessonManager.addChatMessage(userText, { from: body.from || 'user' });
      const st = lessonManager.getState();
      const currentTopic = st.currentTopicId || st.todo[0]?.id;
      const futureTopics = st.todo.slice(1, 6).map(t => t.id);
      logger.info({ event: 'chat.classify_start', qid: q.id, text: q.text, currentTopic, futureTopics });
      // Passo 1: heurística irrelevância + cache
      const recentIgnored = st.questionsQueue.filter(x => x.route === 'IGNORE').slice(-10).map(x => x.text.toLowerCase());
  const irrelevanceCached = cacheIrrelevanceGet(q.text);
      const heur = heuristicIrrelevance(q.text, recentIgnored);
      let irrelevanceFinal = false; let irrelevanceReason = '';
      if (irrelevanceCached) {
        irrelevanceFinal = irrelevanceCached.result; irrelevanceReason = 'cache:' + irrelevanceCached.reason;
        lessonManager.recordIrrelevance('cache');
      } else if (heur.decided && heur.irrelevant) {
        irrelevanceFinal = true; irrelevanceReason = heur.reason || 'heuristic';
        cacheIrrelevanceSet(q.text, true, irrelevanceReason);
        lessonManager.recordIrrelevance('heuristic');
      } else if (!heur.decided && heur.uncertain) {
        // fallback LLM irrelevância
        try {
          const irr = await ragAgent.classifyIrrelevance(q.text);
          if (irr.irrelevant && irr.confidence >= 0.6) {
            irrelevanceFinal = true; irrelevanceReason = 'llm:'+ (irr.rationale || 'irrelevant');
            cacheIrrelevanceSet(q.text, true, irrelevanceReason);
            lessonManager.recordIrrelevance('llm');
          }
        } catch (e) {
          logger.warn({ event: 'irrelevance_llm_error', qid: q.id, error: (e as Error).message });
        }
      }
      // Passo 2: chamada LLM principal apenas se ainda não irrelevante
      const cls = irrelevanceFinal ? { route: 'IGNORE', topicRelevance: 'OUT_OF_SCOPE', needsRAG: false, reason: irrelevanceReason } : await ragAgent.classifyQuestion(q.text, { currentTopic, futureTopics });
      const det = determineRoute(q.text, cls);
  let routeRaw = det.route;
  const needsRAG = det.needsRAG;
      // Forçar override manual válido abrangendo novas rotas
      const manualAllowed = ['CHAT_NOW','PAUSE','END_TOPIC','IGNORE','NOTE','FINAL'] as const;
  if (body.forceRoute && (manualAllowed as readonly string[]).includes(body.forceRoute as unknown as typeof manualAllowed[number])) {
        routeRaw = body.forceRoute as typeof manualAllowed[number];
        logger.info({ event: 'chat.force_route_override', qid: q.id, forced: routeRaw });
      }
      // Classifica
      // Se heurística incerta + não irrelevante e não cache, opcional: se rota final IGNORE mas heurística não marcou => manter rationale
      const reasonCombined = [cls.reason, heur.decided ? heur.reason : undefined, irrelevanceReason || undefined]
        .filter(Boolean)
        .join('|');
      lessonManager.classifyQuestion(q.id, routeRaw as typeof manualAllowed[number], { needsRAG: needsRAG, reason: reasonCombined });
      // Classifica no lessonManager com rota final
      let answerRecord = null;
      let autoProcessed = false;
      
      logger.info({ 
        event: 'chat.route_determined', 
        qid: q.id, 
        route: routeRaw, 
        needsRAG,
        reason: reasonCombined || 'default'
      });
      
      if (routeRaw === 'CHAT_NOW') {
        try {
          logger.info({ event: 'chat.generating_answer', qid: q.id, mode: 'chat_now' });
          const full = await ragAgent.answerWithCitations(q.text, currentTopic);
          const short = shortenAnswer('chat_now', full);
          lessonManager.pushAnswer(q.id, short.trim(), 'chat_now');
          answerRecord = lessonManager.getState().answers.at(-1) || null;
          autoProcessed = true;
          logger.info({ event: 'chat.answer_generated', qid: q.id, hasAnswer: !!answerRecord });
        } catch (e) { 
          logger.warn({ event: 'chat.answer_error', mode: 'chat_now', qid: q.id, error: (e as Error).message }); 
        }
      } else if (routeRaw === 'PAUSE') {
        // Agenda pausa curta para permitir consolidação; não gera resposta individual agora
        logger.info({ event: 'chat.pause_requested', qid: q.id, duration: 4000 });
        lessonManager.requestPause(4000, 'question_pause');
      } else if (routeRaw === 'END_TOPIC') {
        // Não gerar resposta imediata: manter pergunta na fila para agregação e flush final
        logger.info({ event: 'chat.end_topic_enqueued', qid: q.id, currentTopic: lessonManager.getState().currentTopicId });
      } else if (routeRaw === 'FINAL') {
        // Aguardará finalização da sessão
        logger.info({ event: 'chat.final_question', qid: q.id });
      } else if (routeRaw === 'NOTE') {
        // Apenas armazenada em presenterNotes
        logger.info({ event: 'chat.note_stored', qid: q.id });
      } else if (routeRaw === 'IGNORE') {
        logger.info({ event: 'chat.classify_ignore', qid: q.id, reason: reasonCombined, topicRelevance: cls.topicRelevance });
      }
      // Garantir que não existam perguntas CHAT_NOW pendentes sem resposta (caso race condition)
      try {
        const stCheck = lessonManager.getState();
        const pendingChatNow = stCheck.questionsQueue.filter(x => x.route === 'CHAT_NOW');
        for (const pend of pendingChatNow) {
          // se ainda não respondida (não há answer com questionId)
          const already = stCheck.answers.find(a => a.questionId === pend.id);
          if (!already) {
            const full = await ragAgent.answerWithCitations(pend.text, stCheck.currentTopicId || undefined);
            const short = shortenAnswer('chat_now', full);
            lessonManager.pushAnswer(pend.id, short.trim(), 'chat_now');
            autoProcessed = true;
          }
        }
      } catch (e) { logger.warn({ event: 'chat.answer_fallback_error', error: (e as Error).message }); }
      logger.info({ event: 'chat.classify_result', qid: q.id, route: routeRaw, needsRAG, autoProcessed, hasAnswer: !!answerRecord });
      
      return reply.send({ 
        ok: true, 
        questionId: q.id, 
        route: routeRaw, 
        answer: answerRecord, 
        needsRAG, 
        autoProcessed,
        timestamp: new Date().toISOString(),
        topic: lessonManager.getState().currentTopicId
      });
    } catch (e) {
      logger.error({ event: 'chat.send_error', error: (e as Error).message });
      return reply.status(500).send({ error: 'internal_error' });
    }
  });

  // Ação manual por id
  app.post('/questions/:id/action', async (request, reply) => {
    try {
      const id = (request.params as { id: string }).id;
      const body = (request.body as { action?: string }) || {};
      const action = body.action?.toUpperCase();
      const allowed = ['IGNORE','CHAT_NOW','PAUSE','END_TOPIC','NOTE','FINAL'] as const;
      if (!action || !(allowed as readonly string[]).includes(action)) return reply.status(400).send({ error: 'invalid_action' });
      const q = lessonManager.getState().questionsQueue.find(qx => qx.id === id);
      if (!q) return reply.status(404).send({ error: 'question_not_found' });
  lessonManager.classifyQuestion(id, action as typeof allowed[number], { needsRAG: q.needsRAG, reason: 'manual' });
      if (action === 'CHAT_NOW') {
        try {
          const full = await ragAgent.answerWithCitations(q.text, lessonManager.getState().currentTopicId || undefined);
          const short = shortenAnswer('chat_now', full);
          lessonManager.pushAnswer(q.id, short.trim(), 'chat_now');
        } catch (e) { return reply.status(500).send({ error: 'answer_error', detail: (e as Error).message }); }
      } else if (action === 'PAUSE') {
        lessonManager.requestPause(4000, 'manual_pause');
      }
      return reply.send({ ok: true, id, action });
    } catch (e) {
      logger.error({ event: 'question.action_error', error: (e as Error).message });
      return reply.status(500).send({ error: 'internal_error' });
    }
  });

  // Pulse: processa perguntas CHAT_NOW, PAUSE consolidação e END_TOPIC se aplicável, sem gerar nova lição
  app.post('/chat/pulse', async (_req, reply) => {
    const before = { answers: lessonManager.getState().answers.length };
    // Executa um micro ciclo do grafo para permitir answerChatNow sem avançar subtask (usa next com maxSteps=1 mas só se não gerar lição nova)
    const st0 = lessonManager.getState();
    const prevLessons = st0.lessons.length;
    await lessonManager.next({ auto: false });
    const st1 = lessonManager.getState();
    const newLessons = st1.lessons.length - prevLessons;
    // Se gerou lição indevidamente, marcamos para não repetir; (design simples: aceitável on-demand)
    return reply.send({ ok: true, answers: st1.answers.length - before.answers, newLesson: newLessons > 0 });
  });

  // Estado do chat (silenciado para evitar poluição de logs frequentes)
  app.get('/chat/state', { logLevel: 'silent' }, async () => {
    const st = lessonManager.getState();
    return {
      questionsQueue: st.questionsQueue,
      broadcastQueue: st.broadcastQueue,
      finalQueue: st.finalQueue,
      presenterNotes: st.presenterNotes,
      answers: st.answers.slice(-50),
      questionsCount: st.questionsQueue.length,
  classifiedEvents: st.classifiedEvents?.slice(-40),
  inserts: (st.inserts || []).slice(-10)
    };
  });

  // multi-agent removido neste refactor (experimental isolado)

  // Minimal endpoints to exercise coordinator advanced actions
  // endpoints de flush removidos (fila tratada via inserts)

  // New enriched endpoints
  app.post('/course/next', async (request, reply) => {
  const bodyNext = request.body as { auto?: boolean; maxSteps?: number } || {};
    const state = await lessonManager.next({ auto: !!bodyNext.auto, maxSteps: bodyNext.maxSteps });
    return reply.send({ ok: true, state });
  });

  // Novo endpoint: gerar somente 1 passo (subtask) e NÃO emitir via SSE automaticamente.
  app.post('/course/next/one', async (_request, reply) => {
    const before = lessonManager.getState().lessons.length;
    await lessonManager.next({ auto: false });
    const after = lessonManager.getState().lessons.length;
    return reply.send({ ok: true, created: after - before, total: after });
  });

  app.post('/course/refine', async (request, reply) => {
  const refineBody = (request.body as { lessonId?: string; prompt?: string }) || {};
  if (!refineBody.lessonId || !refineBody.prompt) return reply.status(400).send({ error: 'lessonId_and_prompt_required' });
  const result = await lessonManager.refine(refineBody.lessonId, refineBody.prompt);
    return reply.send({ ok: true, result });
  });

  // Static UI page
  app.get('/ui', async (_req: FastifyRequest, reply: FastifyReply) => {
    const fp = path.resolve(process.cwd(), 'public', 'ui', 'ui.html');
  reply.type('text/html').send(await readFile(fp,'utf-8'));
  });

  // Assets estáticos mínimos (sem plugin) — evita 404 do CSS/JS
  app.get('/ui/ui.css', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const fp = path.resolve(process.cwd(), 'public', 'ui', 'ui.css');
  const css = await readFile(fp,'utf-8');
      reply.type('text/css').send(css);
    } catch (e) {
      reply.code(404).type('text/plain').send('/* ui.css não encontrado */');
    }
  });
  app.get('/ui/ui.js', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const fp = path.resolve(process.cwd(), 'public', 'ui', 'ui.js');
  const js = await readFile(fp,'utf-8');
      reply.type('application/javascript').send(js);
    } catch (e) {
      reply.code(404).type('text/plain').send('// ui.js não encontrado');
    }
  });

  // SSE streaming of lesson generation (step-by-step)
  app.get('/course/stream', async (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Transfer-Encoding': 'chunked'
    });
    reply.raw.write('\n');
    let closed = false;
    request.raw.on('close', () => { closed = true; });

    function sse(event: string, data: Record<string, unknown>) {
      // Inclui o campo "type" no payload para facilitar consumo por clientes simples
      const payload = { type: event, ...data } as Record<string, unknown>;
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
      // flush if possible
  // @ts-expect-error: flush pode não existir em alguns ambientes
  if (reply.raw.flush) reply.raw.flush();
    }

    let lastHeartbeat = Date.now();
    // Emit immediate events so clients have prompt feedback
    try {
      const initState = lessonManager.getState();
      sse('log', { msg: 'stream_open' });
  sse('heartbeat', { timestamp: Date.now(), isoTimestamp: new Date().toISOString(), paused: initState.isPaused, pauseUntil: initState.pauseUntil || null });
      lastHeartbeat = Date.now();
  } catch { /* ignore init emit errors */ }

    try {
      // If not initialized yet, initialize with default todos
      if (!lessonManager.getState().lessons.length && !lessonManager.getState().currentTopicId && lessonManager.getState().todo.length === 0) {
        await lessonManager.init();
        sse('log', { msg: 'initialized' });
      }
      let lastTopic = lessonManager.getState().currentTopicId;
      let lastSentLessonIndex = 0;
      while (!closed) {
        const state = lessonManager.getState();
    // heartbeat
  if (Date.now() - lastHeartbeat > 1000) { sse('heartbeat', { timestamp: Date.now(), isoTimestamp: new Date().toISOString(), paused: state.isPaused, pauseUntil: state.pauseUntil || null }); lastHeartbeat = Date.now(); }

        // Expirar pausa se necessário
        if (state.isPaused && state.pauseUntil && Date.now() >= state.pauseUntil) {
          lessonManager.forceResume();
        }

        // Tentar consolidar perguntas de PAUSE (após saída de pausa)
        try {
          const processed = await lessonManager.processPauseQuestions();
          if (processed) { sse('log', { msg: 'pause_questions_consolidated' }); }
        } catch { /* silent */ }

        // Emit classification events para front poder reagir rapidamente
        const st2 = lessonManager.getState();
        if (st2.classifiedEvents?.length) {
          while(st2.classifiedEvents.length){
            const evc = st2.classifiedEvents.shift()!;
            sse('classified', evc);
          }
        }

        // flush automático de respostas END_TOPIC quando tópico muda ou estado finalizado
        if (state.currentTopicId !== lastTopic) {
          const endTopicCount = state.broadcastQueue?.filter(b => b.route === 'END_TOPIC').length || 0;
          logger.info({ event: 'topic.changed', from: lastTopic, to: state.currentTopicId, endTopicCount });
          lastTopic = state.currentTopicId;
          // flush respostas end_topic agora que tópico mudou
          const lm = lessonManager as unknown as LessonManagerWithFlush;
          if (lm.flushEndTopicAnswers && endTopicCount > 0) { 
            logger.info({ event: 'topic.flush_end_topic_start', endTopicCount });
            await lm.flushEndTopicAnswers(); 
            logger.info({ event: 'topic.flush_end_topic_complete' });
          }
        }

        // Emit inserts: finalizados são consumidos; pendentes (placeholder) reemitidos se version mudar
        // Armazena versões já emitidas de inserts pendentes no closure da função sse (uso controlado de any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!('__lastInsertVersions' in (sse as unknown as any))) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (sse as unknown as any).__lastInsertVersions = new Map<string, number>();
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lastVersions: Map<string, number> = (sse as unknown as any).__lastInsertVersions;
        if (state.inserts && state.inserts.length) {
          // Separe pendentes e finalizados
          const pending = state.inserts.filter(i => i.pending);
            const finals = state.inserts.filter(i => !i.pending);
          // Emit pendentes se nova versão
          for (const pin of pending) {
            const prevV = lastVersions.get(pin.id) || 0;
            const v = pin.version || 1;
            if (v > prevV) {
              lastVersions.set(pin.id, v);
              sse('insert', { data: { id: pin.id, mode: pin.mode, text: pin.text, ts: pin.ts, version: v, pending: true, questionIds: pin.questionIds || [], isoTimestamp: new Date().toISOString() } });
            }
          }
          // Emit finais uma vez e remover do array original (consumir)
          if (finals.length) {
            for (const fin of finals) {
              if (fin.pending) continue;
              if (fin.mode !== 'pause' && fin.mode !== 'end_topic' && fin.mode !== 'final_session') continue;
              sse('insert', { data: { id: fin.id, mode: fin.mode, text: fin.text, ts: fin.ts, pending: false, questionIds: fin.questionIds || [], isoTimestamp: new Date().toISOString() } });
            }
            // filtra removendo apenas finalizados (não pendentes)
            state.inserts = state.inserts.filter(i => i.pending);
          }
        }
        // Emit novas lições já geradas mas ainda não enviadas
        const totalLessons = state.lessons.length;
        if (lastSentLessonIndex < totalLessons) {
          for (let i = lastSentLessonIndex; i < totalLessons; i++) {
            const lesson = state.lessons[i];
            sse('lesson', { ...lesson, idx: i, serverTs: Date.now() });
            lastSentLessonIndex = i + 1;
            if (closed) break;
          }
        }
        if (state.done) {
          const lm = lessonManager as unknown as LessonManagerWithFlush;
          // primeiro processa end_topic (await porque agora assíncrono)
          if (lm.flushEndTopicAnswers) { await lm.flushEndTopicAnswers(); }
          // depois gera bloco final de sessão (se existir fila final)
          await lessonManager.finalizeSessionQuestions();
          if (!(state.inserts && state.inserts.length)) {
            sse('done', { total: state.lessons.length });
            break;
          }
        }
        await new Promise(r => setTimeout(r, 250));
      }
      if (!closed) sse('done', { total: lessonManager.getState().lessons.length, final: true });
    } catch (e) {
      sse('error', { error: (e as Error).message });
    } finally {
      reply.raw.end();
    }
  });

}

// ---- Helpers ----
// getRagAgent removido: usamos import estático ragAgent

function shortenAnswer(mode: 'chat_now' | 'pause' | 'end_topic', full: string) {
  const noRefs = full.replace(/Referências?:[\s\S]*/i, '').trim();
  const sentences = noRefs.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (mode === 'chat_now') return sentences.slice(0, 3).join(' ').slice(0, 400);
  if (mode === 'pause') return sentences.slice(0, 6).join(' ').slice(0, 900);
  return 'Em resumo: ' + sentences.slice(0, 10).join(' ').slice(0, 1000);
}
