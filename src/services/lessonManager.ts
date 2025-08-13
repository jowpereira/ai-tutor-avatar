import { buildLessonGraph } from '../graph/lessonGraph.js';
import { logger } from '../utils/observability.js';
import { promises as fs } from 'fs';
import path from 'path';
import { ragAgent } from '../agents/rag.js';

export interface Subtask { id: string; title: string }
export interface Topic { id: string; title: string; subtasks: Subtask[] }
export type QuestionRoute = 'CHAT_NOW' | 'PAUSE' | 'END_TOPIC' | 'IGNORE';
export interface Question { id: string; text: string; ts: number; from: string; route?: QuestionRoute; needsRAG?: boolean; reason?: string }
export interface BroadcastItem { id: string; questionId: string; text: string; score: number; needsRAG: boolean; reason?: string; route: Exclude<QuestionRoute,'CHAT_NOW'|'IGNORE'> }
export interface Answer { id: string; questionId: string; answer: string; mode: 'chat_now' | 'broadcast'; ts: number; refs?: string[] }

interface LessonManagerState {
  todo: Topic[];
  lessons: any[]; // manter sem tipagem detalhada (conteúdo já existente)
  currentTopicId: string | null;
  currentSubtaskId: string | null;
  currentQuestionId?: string | null;
  draft: string;
  grounded: string;
  done: boolean;
  logs: any[];
  questionsQueue: Question[];
  broadcastQueue: BroadcastItem[];
  answers: Answer[];
  route?: string | null;
  version?: number;
}

class LessonManager {
  private graph = buildLessonGraph();
  private state: LessonManagerState = {
  todo: [], lessons: [], currentTopicId: null, currentSubtaskId: null, currentQuestionId: null, draft: '', grounded: '', done: false, logs: [],
  questionsQueue: [], broadcastQueue: [], answers: [], route: null, version: 1
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
  this.state = { ...this.state, todo: todos, lessons: [], currentTopicId: null, currentSubtaskId: null, currentQuestionId: null, draft: '', grounded: '', done: false, questionsQueue: [], broadcastQueue: [], answers: [], route: null };
    logger.info({ event: 'lesson_manager_init', topics: todos.length });
    // run first pick step
    this.state = await this.graph.invoke({ ...this.state });
    await this.persist();
    return this.state;
  }

  async next(options?: { auto?: boolean; maxSteps?: number }) {
    if (this.state.done) return this.state;
    const { auto = false, maxSteps = 25 } = options || {};
    let steps = 0;
    let created = 0;
    do {
      const prevLessons = this.state.lessons.length;
      this.state = await this.graph.invoke({ ...this.state });
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
    logger.info({ event: 'lesson_manager_step', steps, created, total: this.state.lessons.length, done: this.state.done });
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
    const q = {
      id: 'q_' + Date.now().toString(36) + Math.random().toString(16).slice(2,6),
      text: text.trim(),
      ts: Date.now(),
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
    if (idx === -1) return;
    const q = this.state.questionsQueue[idx];
    q.route = route;
    q.needsRAG = !!opts?.needsRAG;
    q.reason = opts?.reason;
    if (route === 'PAUSE' || route === 'END_TOPIC') {
      this.state.broadcastQueue.push({ id: 'b_'+q.id, questionId: q.id, text: q.text, score: 1, needsRAG: q.needsRAG, reason: q.reason, route });
    }
    this.persist();
  }

  pushAnswer(questionId: string, answer: string, mode: 'chat_now' | 'broadcast', refs?: string[]) {
    this.state.answers.push({ id: 'ans_'+questionId, questionId, answer, mode, ts: Date.now(), refs });
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

  async appendLesson(lesson: any) {
    // evita duplicação pelo subtaskId
    if (this.state.lessons.find(l => l.subtaskId === lesson.subtaskId)) return;
    this.state.lessons.push(lesson);
    this.normalizeLastLesson();
    await this.persist();
  }
}

export const lessonManager = new LessonManager();
