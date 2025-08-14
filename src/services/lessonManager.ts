import { promises as fs } from 'fs';
import path from 'path';
import { buildLessonGraph } from '../graph/lessonGraph.js';
import { logger } from '../utils/observability.js';
// eslint-disable-next-line import/no-unresolved
import { ragAgent } from '../agents/rag.js';

export interface Subtask { id: string; title: string }
export interface Topic { id: string; title: string; subtasks: Subtask[] }
export type QuestionRoute = 'CHAT_NOW' | 'PAUSE' | 'END_TOPIC' | 'IGNORE' | 'NOTE' | 'FINAL';
export interface Question { id: string; text: string; ts: number; from: string; route?: QuestionRoute; needsRAG?: boolean; reason?: string }
export interface BroadcastItem { id: string; questionId: string; text: string; score: number; needsRAG: boolean; reason?: string; route: Exclude<QuestionRoute,'CHAT_NOW'|'IGNORE'> }
export interface Answer { id: string; questionId: string; answer: string; mode: 'chat_now' | 'broadcast' | 'pause' | 'end_topic'; ts: number; refs?: string[] }

interface LessonContent { id?: string; subtaskId?: string; content?: string; grounded?: string; draft?: string; citations?: string[]; refined?: boolean; refinedAt?: number }
interface LessonManagerState {
  todo: Topic[];
  lessons: LessonContent[];
  currentTopicId: string | null;
  currentSubtaskId: string | null;
  currentQuestionId?: string | null;
  sessionId?: string;
  traceId?: string;
  draft: string;
  grounded: string;
  done: boolean;
  logs: { event: string; [k: string]: unknown }[];
  questionsQueue: Question[];
  broadcastQueue: BroadcastItem[]; // PAUSE e END_TOPIC (por tópico)
  finalQueue?: { id: string; questionId: string; text: string; ts: number; needsRAG: boolean; reason?: string }[];
  presenterNotes?: { id: string; questionId: string; text: string; ts: number; reason?: string }[];
  answers: Answer[];
  route?: string | null;
  version?: number;
  isPaused: boolean;
  pauseUntil?: number;
  // inserts: blocos agregados enviados ao apresentador (pausa, fim de tópico, fim de sessão)
  inserts?: { id: string; mode: 'pause' | 'end_topic' | 'final_session'; text: string; ts: number; questionIds?: string[]; pending?: boolean; version?: number }[];
  classifiedEvents: { id: string; route: QuestionRoute; ts: number; reason?: string }[];
  metrics?: {
    routeCounts: Record<QuestionRoute, number>;
    irrelevance: { heuristic: number; llm: number; cache: number; totalIgnored: number };
  };
}

class LessonManager {
  private graph = buildLessonGraph();
  private state: LessonManagerState = {
    todo: [], lessons: [], currentTopicId: null, currentSubtaskId: null, currentQuestionId: null, draft: '', grounded: '', done: false, logs: [],
  questionsQueue: [], broadcastQueue: [], answers: [], route: null, version: 1,
  isPaused: false, pauseUntil: undefined, inserts: [],
  classifiedEvents: [],
  finalQueue: [],
  presenterNotes: [],
  metrics: {
    routeCounts: { CHAT_NOW: 0, PAUSE: 0, END_TOPIC: 0, IGNORE: 0, NOTE: 0, FINAL: 0 },
    irrelevance: { heuristic: 0, llm: 0, cache: 0, totalIgnored: 0 }
  }
  };
  private persistFile = path.resolve(process.cwd(), 'data', 'training', 'generated-lessons.json');

  async loadDefaultTodos() {
    const fp = path.resolve(process.cwd(), 'data', 'training', 'todos', 'todos.json');
    const raw = await fs.readFile(fp, 'utf-8');
    return JSON.parse(raw);
  }

  async init(todos?: Topic[]) {
    if (!todos || !todos.length) {
      todos = await this.loadDefaultTodos();
    }
  const sessionId = 'sess_'+Date.now().toString(36);
  const traceId = sessionId + '_t0';
  const safeTodos: Topic[] = todos || [];
  this.state = { ...this.state, sessionId, traceId, todo: safeTodos, lessons: [], currentTopicId: null, currentSubtaskId: null, currentQuestionId: null, draft: '', grounded: '', done: false, questionsQueue: [], broadcastQueue: [], answers: [], route: null, isPaused: false, pauseUntil: undefined, inserts: [], finalQueue: [], presenterNotes: [], metrics: { routeCounts: { CHAT_NOW: 0, PAUSE: 0, END_TOPIC: 0, IGNORE: 0, NOTE: 0, FINAL: 0 }, irrelevance: { heuristic: 0, llm: 0, cache: 0, totalIgnored: 0 } } };
  logger.info({ event: 'lesson_manager_init', topics: safeTodos.length, sessionId, traceId });
    // run first pick step
  this.state = await (this.graph as unknown as { invoke: (s: LessonManagerState) => Promise<LessonManagerState> }).invoke({ ...this.state });
    await this.persist();
    return this.state;
  }

  async next(options?: { auto?: boolean; maxSteps?: number }) {
    // Respeita pausa
    if (this.state.isPaused) {
      if (this.state.pauseUntil && Date.now() >= this.state.pauseUntil) {
        this.state.isPaused = false; this.state.pauseUntil = undefined; logger.info({ event: 'lesson_pause_expired' });
      } else {
        logger.debug({ event: 'lesson_paused_skip_step' });
        return this.state;
      }
    }
    if (this.state.done) return this.state;
    const { auto = false, maxSteps = 25 } = options || {};
    let steps = 0;
    let created = 0;
    do {
      const prevLessons = this.state.lessons.length;
  const before = Date.now();
  this.state = await (this.graph as unknown as { invoke: (s: LessonManagerState) => Promise<LessonManagerState> }).invoke({ ...this.state });
  const stepMs = Date.now() - before;
  logger.debug({ event: 'lesson_manager_graph_step', sessionId: this.state.sessionId, traceId: this.state.traceId, stepMs, lessons: this.state.lessons.length });
      const newLessons = this.state.lessons.length - prevLessons;
      if (newLessons > 0) {
        created += newLessons;
        // normalize & persist each new lesson
        this.normalizeLastLesson();
        await this.persist();
      }
      steps++;
      if (!auto) break;
    } while (!this.state.done && steps < maxSteps);
  logger.info({ event: 'lesson_manager_step', steps, created, total: this.state.lessons.length, done: this.state.done, sessionId: this.state.sessionId });
    return this.state;
  }

  async refine(lessonId: string, prompt: string) {
    const idx = this.state.lessons.findIndex(l => l.id === lessonId);
    if (idx === -1) return { error: 'lesson_not_found' };
    const target = this.state.lessons[idx];
    const appended = `${target.content || target.grounded || target.draft || ''}\n\n[Refinamento]: ${prompt.trim()}`;
    const normalized = this.normalizeCitations(appended);
    this.state.lessons[idx] = { ...target, content: normalized.text, citations: normalized.citations, refined: true, refinedAt: Date.now() };
    await this.persist();
    logger.info({ event: 'lesson_refined', lessonId });
    return this.state.lessons[idx];
  }

  private normalizeLastLesson() {
    const last = this.state.lessons[this.state.lessons.length - 1];
    if (!last) return;
    const content = last.content || last.grounded || last.draft;
    if (!content) return;
    const normalized = this.normalizeCitations(content);
    last.content = normalized.text;
    last.citations = normalized.citations;
  }

  private normalizeCitations(raw: string) {
    const matches = raw.match(/\[\[ref:[^\]]+\]\]/g) || [];
    const uniq: string[] = [];
    for (const m of matches) if (!uniq.includes(m)) uniq.push(m);
    return { text: raw, citations: uniq };
  }

  private async persist() {
    try {
      await fs.mkdir(path.dirname(this.persistFile), { recursive: true });
      await fs.writeFile(this.persistFile, JSON.stringify({ ...this.state, lessons: this.state.lessons }, null, 2), 'utf-8');
    } catch (e) {
      logger.warn({ event: 'lesson_manager_persist_error', error: (e as Error).message });
    }
  }

  getState() { return this.state; }

  addChatMessage(text: string, meta?: Partial<Omit<Question,'id'|'text'|'ts'>>) {
    const q: Question = {
      id: 'q_' + Date.now().toString(36) + Math.random().toString(16).slice(2,6),
      text: text.trim(),
      ts: Date.now(),
      from: meta?.from || 'user',
      route: undefined,
      needsRAG: false,
      ...meta
    };
    this.state.questionsQueue.push(q);
    this.persist();
    return q;
  }

  classifyQuestion(id: string, route: QuestionRoute, opts?: { needsRAG?: boolean; reason?: string }) {
    const idx = this.state.questionsQueue.findIndex(q => q.id === id);
    if (idx === -1) {
      logger.warn({ event: 'classify_question_not_found', id, route });
      return;
    }
    const q = this.state.questionsQueue[idx];
    q.route = route;
    q.needsRAG = !!opts?.needsRAG;
    q.reason = opts?.reason;
    
    logger.info({ event: 'classify_question_success', id: q.id, route, text: q.text.slice(0,50) });
    
    if (route === 'PAUSE' || route === 'END_TOPIC') {
      this.state.broadcastQueue.push({ id: 'b_'+q.id, questionId: q.id, text: q.text, score: 1, needsRAG: q.needsRAG, reason: q.reason, route: route as Exclude<QuestionRoute,'CHAT_NOW'|'IGNORE'|'NOTE'|'FINAL'> });
      if (route === 'END_TOPIC') {
        if (!this.state.inserts) this.state.inserts = [];
        let placeholder = this.state.inserts.find(i => i.mode === 'end_topic' && i.pending);
        if (!placeholder) {
          placeholder = { id: 'end_topic_block_pending_'+Date.now(), mode: 'end_topic', text: '⏳ Coletando perguntas de fim de tópico...', ts: Date.now(), questionIds: [], pending: true, version: 1 };
          this.state.inserts.push(placeholder);
          logger.info({ event: 'end_topic.placeholder_created', questionId: q.id });
        }
        // Atualiza placeholder agregando pergunta
        if (!placeholder.questionIds) placeholder.questionIds = [];
        if (!placeholder.questionIds.includes(q.id)) {
          placeholder.questionIds.push(q.id);
          placeholder.version = (placeholder.version || 0) + 1;
          const collected = placeholder.questionIds.length;
          const texts = this.state.broadcastQueue.filter(b => b.route === 'END_TOPIC' && placeholder!.questionIds!.includes(b.questionId))
            .map((b, idx) => `${idx+1}. ${b.text}`);
          placeholder.text = `⏳ Coletando perguntas de fim de tópico (${collected}):\n\n${texts.join('\n')}`;
          logger.info({ event: 'end_topic.placeholder_updated', count: collected });
        }
      }
    } else if (route === 'FINAL') {
      this.state.finalQueue?.push({ id: 'f_'+q.id, questionId: q.id, text: q.text, ts: Date.now(), needsRAG: q.needsRAG || false, reason: q.reason });
    } else if (route === 'NOTE') {
      this.state.presenterNotes?.push({ id: 'n_'+q.id, questionId: q.id, text: q.text, ts: Date.now(), reason: q.reason });
    }
    
    // Garantir que classifiedEvents existe
    if (!this.state.classifiedEvents) this.state.classifiedEvents = [];
    this.state.classifiedEvents.push({ id: q.id, route, ts: Date.now(), reason: q.reason });
    
    // métricas
    try {
      if (this.state.metrics) {
        this.state.metrics.routeCounts[route] = (this.state.metrics.routeCounts[route] || 0) + 1;
        if (route === 'IGNORE') this.state.metrics.irrelevance.totalIgnored += 1;
      }
    } catch (e) { 
      logger.warn({ event: 'metrics_update_error', error: (e as Error).message });
    }
    this.persist();
  }

  recordIrrelevance(kind: 'heuristic' | 'llm' | 'cache') {
    if (!this.state.metrics) return;
    this.state.metrics.irrelevance[kind] += 1;
  }

  getMetrics() {
    return this.state.metrics;
  }

  pushAnswer(questionId: string, answer: string, mode: 'chat_now' | 'broadcast' | 'pause' | 'end_topic', refs?: string[]) {
    this.state.answers.push({ id: 'ans_'+questionId, questionId, answer, mode, ts: Date.now(), refs });
    // end_topic agora é consolidado apenas em flushEndTopicAnswers; não gerar insert individual aqui
    this.state.questionsQueue = this.state.questionsQueue.filter(q => q.id !== questionId);
    this.state.broadcastQueue = this.state.broadcastQueue.filter(b => b.questionId !== questionId);
    if (this.state.currentQuestionId === questionId) this.state.currentQuestionId = null;
    this.persist();
  }

  async answerNowLLM(questionId: string) {
    const q = this.state.questionsQueue.find(x => x.id === questionId);
    if (!q) return;
    let answer: string;
    try {
      if (q.needsRAG) {
        const full = await ragAgent.answerWithCitations(q.text, this.state.currentTopicId || undefined);
        answer = full;
      } else {
        const brief = await ragAgent.answerWithCitations(q.text, this.state.currentTopicId || undefined);
        // heurística: pegar primeiras ~4 linhas para chat_now
        answer = brief.split(/\n+/).slice(0,4).join('\n');
      }
    } catch (e) {
      answer = 'Falha ao gerar resposta agora: ' + (e as Error).message;
    }
    this.pushAnswer(q.id, answer, 'chat_now');
  }

  async broadcastAll() {
    if (!this.state.broadcastQueue.length) return [];
    const processed: Answer[] = [];
    for (const item of [...this.state.broadcastQueue]) {
      const q = this.state.questionsQueue.find(qx => qx.id === item.questionId) || { text: item.text, id: item.questionId, from: 'user', ts: Date.now() } as Question;
      let answer: string;
      try {
        const full = await ragAgent.answerWithCitations(q.text, this.state.currentTopicId || undefined);
        answer = full;
      } catch (e) {
        answer = 'Falha ao gerar resposta broadcast: ' + (e as Error).message;
      }
      this.pushAnswer(q.id, answer, 'broadcast');
      processed.push(this.state.answers[this.state.answers.length - 1]);
    }
    return processed;
  }

  async appendLesson(lesson: LessonContent) {
    if (!lesson) return;
    // evita duplicação pelo subtaskId
    if (lesson.subtaskId && this.state.lessons.find(l => l.subtaskId === lesson.subtaskId)) return;
    this.state.lessons.push(lesson);
    this.normalizeLastLesson();
    await this.persist();
  }

  /**
   * Consolida perguntas classificadas como PAUSE em um único insert logo após conclusão de uma lição.
   * - Não gera entradas em answers (mantém respostas fora do chat).
   * - Remove perguntas processadas de questionsQueue e broadcastQueue.
   * - Cada pergunta recebe resposta completa (RAG se marcado needsRAG) de forma sequencial para simplicidade.
   */
  async processPauseQuestions() {
    // Só processa se não estiver em pausa ativa (aguarda expiração para consolidar)
    if (this.state.isPaused) return false;
    const pauseQuestions = (this.state.questionsQueue || []).filter(q => q.route === 'PAUSE');
    if (!pauseQuestions.length) return false;
    const blocks: string[] = [];
    for (const q of pauseQuestions) {
      let answer: string;
      try {
        const full = await ragAgent.answerWithCitations(q.text, this.state.currentTopicId || undefined);
        answer = full;
      } catch (e) {
        answer = 'Falha ao gerar resposta pausa: ' + (e as Error).message;
      }
      blocks.push(`### Pergunta\n${q.text}\n\n**Resposta:**\n${answer}`);
    }
    const consolidated = {
      id: 'pause_block_' + Date.now(),
      mode: 'pause' as const,
      text: `## Perguntas da Pausa\n\n${blocks.join('\n\n---\n\n')}`,
      ts: Date.now(),
      questionIds: pauseQuestions.map(p => p.id)
    };
    if (!this.state.inserts) this.state.inserts = [];
    this.state.inserts.push(consolidated);
    // remover perguntas processadas das filas
    const processedIds = new Set(pauseQuestions.map(p => p.id));
    this.state.questionsQueue = this.state.questionsQueue.filter(q => !processedIds.has(q.id));
    this.state.broadcastQueue = this.state.broadcastQueue.filter(b => !processedIds.has(b.questionId));
    logger.info({ event: 'pause_questions_processed', count: pauseQuestions.length, insertId: consolidated.id });
    await this.persist();
    return true;
  }

  requestPause(ms: number, reason?: string) {
  const now = Date.now();
  this.state.isPaused = true;
  const newUntil = now + ms;
  if (!this.state.pauseUntil || this.state.pauseUntil < newUntil) this.state.pauseUntil = newUntil;
    logger.info({ event: 'lesson_pause_requested', ms, reason });
  }

  forceResume() {
    if (this.state.isPaused) {
      this.state.isPaused = false; this.state.pauseUntil = undefined; logger.info({ event: 'lesson_resumed_force' });
    }
  }

  // Flush respostas marcadas como end_topic (já viraram inserts ao pushAnswer).
  // Mantido para compatibilidade com chamada condicional no stream.
  async flushEndTopicAnswers(limit = 5) {
    logger.info({ event: 'flush_end_topic_start', currentTopicId: this.state.currentTopicId });
    // Seleciona perguntas END_TOPIC pendentes na broadcastQueue
    const endItems = (this.state.broadcastQueue || []).filter(b => b.route === 'END_TOPIC');
    logger.info({ event: 'flush_end_topic_found_items', count: endItems.length, items: endItems.map(i => ({ id: i.questionId, text: i.text.substring(0, 50) })) });
    if (!endItems.length) return;
    // Remove qualquer bloco pendente anterior de end_topic
    if (this.state.inserts && this.state.inserts.length) {
      const beforeCount = this.state.inserts.length;
      // Remove apenas placeholder pendente antes de gerar bloco final
      this.state.inserts = this.state.inserts.filter(ins => !(ins.mode === 'end_topic' && ins.pending));
      const afterCount = this.state.inserts.length;
      logger.info({ event: 'flush_end_topic_removed_placeholder', beforeCount, afterCount });
    }
    // Scoring simples
    const scored = endItems.map(it => ({ ...it, _score: this.scoreQuestionForSummary(it.text) }));
    scored.sort((a,b)=> b._score - a._score);
    const picked = scored.slice(0, limit);
    const blocks: string[] = [];
    for (const item of picked) {
      let answer = '';
      try {
        const full = await ragAgent.answerWithCitations(item.text, this.state.currentTopicId || undefined);
        answer = full;
      } catch (e) {
        answer = 'Falha ao gerar resposta end_topic: ' + (e as Error).message;
      }
      blocks.push(`### Pergunta\n${item.text}\n\n**Resposta:**\n${answer}`);
    }
    if (!blocks.length) return;
    if (!this.state.inserts) this.state.inserts = [];
    const pickedIds = picked.map(p=>p.questionId);
    this.state.inserts.push({ id: 'end_topic_block_'+Date.now(), mode: 'end_topic', text: `## Questões do Fim do Tópico\n\n${blocks.join('\n\n---\n\n')}`, ts: Date.now(), questionIds: pickedIds });
    const processedIds = new Set(picked.map(p=>p.questionId));
    this.state.broadcastQueue = this.state.broadcastQueue.filter(b => !processedIds.has(b.questionId));
    this.state.questionsQueue = this.state.questionsQueue.filter(q => !processedIds.has(q.id));
    logger.info({ event: 'end_topic_questions_processed', count: picked.length, questionIds: pickedIds });
  }  async finalizeSessionQuestions(limit = 6) {
    const finalItems = [...(this.state.finalQueue || [])];
    if (!finalItems.length) return;
    const scored = finalItems.map(it => ({ ...it, _score: this.scoreQuestionForSummary(it.text) + 0.5 }));
    scored.sort((a,b)=> b._score - a._score);
    const picked = scored.slice(0, limit);
    const blocks: string[] = [];
    for (const item of picked) {
      let answer = '';
      try {
        const full = await ragAgent.answerWithCitations(item.text, this.state.currentTopicId || undefined);
        answer = full;
      } catch (e) { answer = 'Falha ao gerar resposta final: '+(e as Error).message; }
      blocks.push(`### Pergunta\n${item.text}\n\n**Resposta:**\n${answer}`);
    }
    if (!blocks.length) return;
    if (!this.state.inserts) this.state.inserts = [];
  this.state.inserts.push({ id: 'final_session_block_'+Date.now(), mode: 'final_session', text: `## Perguntas Finais da Sessão\n\n${blocks.join('\n\n---\n\n')}`, ts: Date.now(), questionIds: picked.map(p=>p.questionId) });
    const processedIds = new Set(picked.map(p=>p.questionId));
    this.state.finalQueue = (this.state.finalQueue||[]).filter(f => !processedIds.has(f.questionId));
    this.state.questionsQueue = this.state.questionsQueue.filter(q => !processedIds.has(q.id));
    logger.info({ event: 'final_session_questions_processed', count: picked.length });
  }

  private scoreQuestionForSummary(text: string) {
    let score = 0;
    const len = text.length;
    if (len < 140) score += 1; else if (len < 260) score += 2; else if (len > 400) score -= 1;
    const qMarks = (text.match(/\?/g) || []).length; if (qMarks > 1) score += 1.5;
    if (/exemplo|exemplifique|compar(a|ar)|diferença/i.test(text)) score += 1;
    if (/por que|porque|motivo|razão/i.test(text)) score += 0.5;
    return score;
  }
}

export const lessonManager = new LessonManager();
// Export types for server usage
export type { LessonManagerState };
