import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import path from 'path';
import { buildGraph } from '../graph/app.js';
import { buildLessonGraph } from '../graph/lessonGraph.js';
import { logger, snapshotMetrics } from '../utils/observability.js';
import { lessonManager } from '../services/lessonManager.js';

const lessonGraphInstance = buildLessonGraph();

export async function registerRoutes(app: FastifyInstance, graph: ReturnType<typeof buildGraph>) {
  app.get('/health', async () => ({ status: 'ok' }));

  app.post('/events', async (request, reply) => {
    try {
      const body: any = request.body;
      let result;
      if (body?.type === 'todo') {
        result = await graph.invoke({ message: `Todo: ${body.todo}`, count: 0 });
      } else if (body?.type === 'message') {
        result = await graph.invoke({ message: body.message, count: 0 });
      } else if (body?.type === 'build_course') {
        const lessonResult = await lessonManager.init(body.todo || []);
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
    } catch (error: any) {
      logger.error({ event: 'graph_invoke_error', error: error.message, stack: error.stack });
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  app.get('/metrics', async () => snapshotMetrics());
  app.get('/course/lessons', async () => ({ lessons: lessonManager.getState().lessons, done: lessonManager.getState().done }));

  // Chat endpoints (fase 2 - MVP julgamento simples)
  app.post('/chat/send', async (request, reply) => {
    try {
      const body: any = request.body || {};
      if (!body.text) return reply.status(400).send({ error: 'text_required' });
      const q = lessonManager.addChatMessage(body.text, { from: body.from || 'user' });
      const st = lessonManager.getState();
      const currentTopic = st.currentTopicId || (st.todo[0]?.id);
      const futureTopics = st.todo.slice(1).map(t => t.id);
      const cls = await (await import('../agents/rag.js')).ragAgent.classifyQuestion(q.text, { currentTopic, futureTopics });
      if (cls.topicRelevance === 'FUTURE' || cls.topicRelevance === 'OUT_OF_SCOPE') {
        lessonManager.classifyQuestion(q.id, 'IGNORE', { needsRAG: false, reason: cls.reason });
        return reply.send({ ok: true, question: q, ignored: true, reason: cls.reason, topicRelevance: cls.topicRelevance });
      }
      lessonManager.classifyQuestion(q.id, cls.route as any, { needsRAG: cls.needsRAG, reason: cls.reason });
      const route = cls.route;
      let answerRecord = null;
      if (route === 'CHAT_NOW') {
        // Disparar passo rápido do grafo para processar answerChatNow
        try {
          await lessonManager.next({ auto: false, maxSteps: 1 });
          const st = lessonManager.getState();
          answerRecord = st.answers.find(a => a.questionId === q.id) || null;
        } catch (e) {
          logger.warn({ event: 'chat_now_step_error', err: (e as Error).message });
        }
      }
      return reply.send({ ok: true, question: q, route, answer: answerRecord });
    } catch (e) {
      logger.error({ event: 'chat_send_error', error: (e as Error).message });
      return reply.status(500).send({ error: 'internal_error' });
    }
  });

  app.get('/chat/state', async () => {
    const st = lessonManager.getState();
    return {
      questionsQueue: st.questionsQueue,
      broadcastQueue: st.broadcastQueue,
      answers: st.answers.slice(-50)
    };
  });

  // New enriched endpoints
  app.post('/course/next', async (request, reply) => {
    const body: any = request.body || {};
    const state = await lessonManager.next({ auto: !!body.auto, maxSteps: body.maxSteps });
    return reply.send({ ok: true, state });
  });

  app.post('/course/refine', async (request, reply) => {
    const body: any = request.body || {};
    if (!body.lessonId || !body.prompt) return reply.status(400).send({ error: 'lessonId_and_prompt_required' });
    const result = await lessonManager.refine(body.lessonId, body.prompt);
    return reply.send({ ok: true, result });
  });

  // Static UI page
  app.get('/ui', async (_req: FastifyRequest, reply: FastifyReply) => {
    const fp = path.resolve(process.cwd(), 'public', 'ui', 'ui.html');
    reply.type('text/html').send(await import('fs/promises').then(m=>m.readFile(fp,'utf-8')));
  });

  // Assets estáticos mínimos (sem plugin) — evita 404 do CSS/JS
  app.get('/ui/ui.css', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const fp = path.resolve(process.cwd(), 'public', 'ui', 'ui.css');
      const css = await import('fs/promises').then(m=>m.readFile(fp,'utf-8'));
      reply.type('text/css').send(css);
    } catch (e) {
      reply.code(404).type('text/plain').send('/* ui.css não encontrado */');
    }
  });
  app.get('/ui/ui.js', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const fp = path.resolve(process.cwd(), 'public', 'ui', 'ui.js');
      const js = await import('fs/promises').then(m=>m.readFile(fp,'utf-8'));
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

    function sse(event: string, data: any) {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      // flush if possible
      // @ts-ignore
      if (reply.raw.flush) reply.raw.flush();
    }

    try {
      // If not initialized yet, initialize with default todos
      if (!lessonManager.getState().lessons.length && !lessonManager.getState().currentTopicId && lessonManager.getState().todo.length === 0) {
        await lessonManager.init();
        sse('log', { msg: 'initialized' });
      }
      while (!lessonManager.getState().done && !closed) {
        const before = lessonManager.getState().lessons.length;
        await lessonManager.next({ auto: false });
        const after = lessonManager.getState().lessons.length;
        if (after > before) {
          const lesson = lessonManager.getState().lessons[after - 1];
          sse('lesson', lesson);
        } else {
          sse('log', { msg: 'step_no_lesson' });
        }
        // Delay entre steps para evitar spam
        await new Promise(r => setTimeout(r, 300));
      }
      if (!closed) sse('done', { total: lessonManager.getState().lessons.length });
    } catch (e) {
      sse('error', { error: (e as Error).message });
    } finally {
      reply.raw.end();
    }
  });

}
