import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { ragAgent } from '../agents/rag.js';
import { logger } from '../utils/observability.js';

// Tipagens simplificadas para integrar fila de perguntas sem circular dependency
interface QuestionState { id: string; text: string; route?: string; needsRAG?: boolean }
interface BroadcastItemState { id: string; questionId: string; text: string; needsRAG?: boolean; route?: string }
interface AnswerState { id: string; questionId: string; answer: string; mode: string; ts: number; refs?: string[] }
interface TopicNode { id: string; title: string; subtasks: { id: string; title: string }[] }
interface LogEntry { node: string; event?: string; action?: string; ms?: number; error?: string; [k: string]: unknown }
interface GenericLesson { subtaskId?: string; id?: string; content?: string; grounded?: string; draft?: string; citations?: string[] }

const LessonState = Annotation.Root({
  todo: Annotation<unknown[]>({ value: (l, r) => (r !== undefined ? r : l), default: () => [] }),
  lessons: Annotation<unknown[]>({ value: (l, r) => (r !== undefined ? r : l), default: () => [] }),
  currentTopicId: Annotation<string | null>({ value: (l, r) => (r !== undefined ? r : l), default: () => null }),
  currentSubtaskId: Annotation<string | null>({ value: (l, r) => (r !== undefined ? r : l), default: () => null }),
  currentQuestionId: Annotation<string | null>({ value: (l, r) => (r !== undefined ? r : l), default: () => null }),
  questionsQueue: Annotation<QuestionState[]>({ value: (l, r) => (r !== undefined ? r : l), default: () => [] }),
  broadcastQueue: Annotation<BroadcastItemState[]>({ value: (l, r) => (r !== undefined ? r : l), default: () => [] }),
  answers: Annotation<AnswerState[]>({ value: (l, r) => (r !== undefined ? r : l), default: () => [] }),
  logs: Annotation<LogEntry[]>({ value: (l, r) => (r ? [...l, ...r] : l), default: () => [] }),
  done: Annotation<boolean>({ value: (l, r) => (r !== undefined ? r : l), default: () => false }),
  draft: Annotation<string>({ value: (l, r) => (r !== undefined ? r : l), default: () => '' }),
  grounded: Annotation<string>({ value: (l, r) => (r !== undefined ? r : l), default: () => '' })
  , sessionId: Annotation<string | null>({ value: (l, r) => (r !== undefined ? r : l), default: () => null })
  , traceId: Annotation<string | null>({ value: (l, r) => (r !== undefined ? r : l), default: () => null })
});

// Removido path/fileURLToPath para ambiente neutralizado de bundling

// loadRag removido (não utilizado diretamente – RAG via ragAgent)

const pickSubtask = (state: typeof LessonState.State): Record<string, unknown> => {
  if (state.done) return {};
  const topic = state.todo[0] as TopicNode | undefined;
  if (!topic) {
    return { done: true, logs: [{ node: 'pickSubtask', action: 'no_topics' }] };
  }
  const remaining = topic.subtasks.filter((s: { id: string }) => !state.lessons.find(l => (l as GenericLesson).subtaskId === s.id));
  if (!remaining.length) {
  return { todo: state.todo.slice(1), currentTopicId: null, currentSubtaskId: null, logs: [{ node: 'pickSubtask', action: 'topic_completed', topic: topic.id }] };
  }
  const sub = remaining[0];
  return { currentTopicId: topic.id, currentSubtaskId: sub.id, logs: [{ node: 'pickSubtask', topic: topic.id, subtask: sub.id }] };
};

// Novo nó: verificar perguntas urgentes (CHAT_NOW) antes de gerar rascunho
const checkQuestions = (state: typeof LessonState.State): Record<string, unknown> => {
  const qs: QuestionState[] = (state.questionsQueue || []);
  const chatNow = qs.find(q => q.route === 'CHAT_NOW');
  if (chatNow) return { logs: [{ node: 'checkQuestions', action: 'answer_now', q: chatNow.id }], currentQuestionId: chatNow.id };
  return { logs: [{ node: 'checkQuestions', action: 'none' }] };
};
// Resposta imediata a perguntas marcadas como CHAT_NOW (ANSWER_NOW)
const answerChatNow = async (state: typeof LessonState.State): Promise<Record<string, unknown>> => {
  const qid = state.currentQuestionId;
  if (!qid) return { logs: [{ node: 'answerChatNow', action: 'skip_no_current' }] };
  const q = state.questionsQueue.find(q => q.id === qid);
  if (!q) return { logs: [{ node: 'answerChatNow', action: 'skip_not_found', qid }] };
  let answer: string;
  try {
    const full = await ragAgent.answerWithCitations(q.text, state.currentTopicId || undefined);
    answer = q.needsRAG ? full : full.split(/\n+/).slice(0, 4).join('\n');
  } catch (e) {
    answer = 'Erro ao responder agora: ' + (e as Error).message;
  }
  return {
    answers: [...state.answers, { id: 'ans_' + qid, questionId: qid, answer, mode: 'chat_now', ts: Date.now() }],
    questionsQueue: state.questionsQueue.filter(x => x.id !== qid),
    currentQuestionId: null,
    logs: [{ node: 'answerChatNow', action: 'answered', qid }]
  };
};

// Responder em broadcast se houver itens na fila após finalizar seção
// Respostas em pausa (entre subtarefas) - processa itens route=PAUSE
const processPauseAnswers = async (state: typeof LessonState.State): Promise<Record<string, unknown>> => {
  const items = (state.broadcastQueue || []).filter(i => i.route === 'PAUSE');
  if (!items.length) return { logs: [{ node: 'processPauseAnswers', action: 'skip' }] };
  const newAnswers = [...state.answers];
  const now = Date.now();
  for (const item of items) {
    const q = state.questionsQueue.find(q => q.id === item.questionId) || { id: item.questionId, text: item.text } as QuestionState;
    try {
      const full = await ragAgent.answerWithCitations(q.text, state.currentTopicId || undefined);
      newAnswers.push({ id: 'ans_' + q.id, questionId: q.id, answer: full, mode: 'pause', ts: now });
    } catch (e) {
      newAnswers.push({ id: 'ans_' + q.id, questionId: q.id, answer: 'Erro pausa: ' + (e as Error).message, mode: 'pause', ts: now });
    }
  }
  const answeredIds = new Set(items.map(i => i.questionId));
  return {
    answers: newAnswers,
    questionsQueue: state.questionsQueue.filter(q => !answeredIds.has(q.id)),
    broadcastQueue: (state.broadcastQueue || []).filter(i => i.route !== 'PAUSE'),
    logs: [{ node: 'processPauseAnswers', count: items.length }]
  };
};

// Respostas de fim de tópico - DESABILITADO: agora gerenciado via lessonManager.flushEndTopicAnswers no SSE
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const processEndTopicAnswers = async (_state: typeof LessonState.State): Promise<Record<string, unknown>> => {
  // SKIP: processamento movido para lessonManager.flushEndTopicAnswers chamado via SSE quando tópico muda
  return { logs: [{ node: 'processEndTopicAnswers', action: 'skip_delegated_to_sse' }] };
};

const draftLesson = async (state: typeof LessonState.State): Promise<Record<string, unknown>> => {
  if (!state.currentTopicId || !state.currentSubtaskId) return {};
  const topic = state.todo.find(t => (t as TopicNode).id === state.currentTopicId) as TopicNode | undefined;
  const sub = topic?.subtasks.find((s: { id: string }) => s.id === state.currentSubtaskId);
  if (!topic || !sub) return {};
  const baseDraft = `Tópico: ${topic.title}\nSubtarefa: ${sub.title}\nResumo inicial: ${sub.title} no contexto de ${topic.title}.`;
  return { logs: [{ node: 'draftLesson', subtask: sub.id }], draft: baseDraft };
};

const groundWithRag = async (state: typeof LessonState.State): Promise<Record<string, unknown>> => {
  if (!state.currentTopicId || !state.currentSubtaskId) return {};
  const topic = state.todo.find(t => (t as TopicNode).id === state.currentTopicId) as TopicNode | undefined;
  const sub = topic?.subtasks.find((s: { id: string }) => s.id === state.currentSubtaskId);
  if (!topic || !sub) return {};
  // Geração direta via LLM (conteúdo final já retorna com Referências)
  const section = await ragAgent.generateLessonSection(state.currentTopicId, sub.title, sub.title);
  return { logs: [{ node: 'groundWithRag', action: 'llm_generate', topic: topic.id, subtask: sub.id }], grounded: section.draft };
};

const finalizeSection = (state: typeof LessonState.State): Record<string, unknown> => {
  if (!state.currentTopicId || !state.currentSubtaskId || !state.grounded) return {};
  const lesson = {
    id: `${state.currentSubtaskId}-sec`,
    topicId: state.currentTopicId,
    subtaskId: state.currentSubtaskId,
    content: state.grounded,
    citations: state.grounded.match(/\[\[ref:[0-9]+\]\]/g) || []
  };
  return {
    lessons: [...state.lessons, lesson],
    logs: [{ node: 'finalizeSection', lesson: lesson.id }],
    currentSubtaskId: null,
    draft: '',
    grounded: ''
  };
};

const markDoneIfFinished = (state: typeof LessonState.State): Record<string, unknown> => {
  if (!state.todo.length && state.currentSubtaskId === null) {
    return { done: true, logs: [{ node: 'markDone', status: 'completed_all' }] };
  }
  return {};
};

export function buildLessonGraph() {
  const g = new StateGraph(LessonState);
  // Instrumentação de telemetria leve
  type NodeFn = (s: typeof LessonState.State) => Record<string, unknown> | Promise<Record<string, unknown>>;
  const instrument = (name: string, fn: NodeFn): NodeFn => async (s) => {
    const start = Date.now();
    try {
      const patch = await fn(s) || {};
      const telemetry: LogEntry = { node: name, event: 'node_telemetry', ms: Date.now() - start, currentQuestionId: s.currentQuestionId || null, sessionId: s.sessionId, traceId: s.traceId };
      if (Array.isArray(patch.logs)) return { ...patch, logs: [...patch.logs, telemetry] };
      return { ...patch, logs: [telemetry] };
    } catch (e) {
      const errLog: LogEntry = { node: name, event: 'node_error', error: (e as Error).message, ms: Date.now() - start, currentQuestionId: s.currentQuestionId || null, sessionId: s.sessionId, traceId: s.traceId };
      logger.error(errLog);
      return { logs: [errLog] };
    }
  };
  g.addNode('pick', instrument('pick', pickSubtask));
  g.addNode('checkQuestions', instrument('checkQuestions', checkQuestions));
  g.addNode('answerChatNow', instrument('answerChatNow', answerChatNow));
  g.addNode('processPauseAnswers', instrument('processPauseAnswers', processPauseAnswers));
  g.addNode('processEndTopicAnswers', instrument('processEndTopicAnswers', processEndTopicAnswers));
  g.addNode('draftNode', instrument('draftNode', draftLesson));
  g.addNode('groundNode', instrument('groundNode', groundWithRag));
  g.addNode('finalizeSection', instrument('finalizeSection', finalizeSection));
  g.addNode('checkDone', instrument('checkDone', markDoneIfFinished));
  // @ts-expect-error edge typing
  g.addEdge(START, 'pick');
  // @ts-expect-error edge typing
  g.addEdge('pick', 'checkQuestions');
  // @ts-expect-error custom node
  g.addEdge('checkQuestions', 'answerChatNow');
  // @ts-expect-error custom node
  g.addEdge('answerChatNow', 'draftNode');
  // @ts-expect-error custom edge
  g.addEdge('finalizeSection', 'processPauseAnswers');
  // @ts-expect-error custom edge
  g.addEdge('processPauseAnswers', 'processEndTopicAnswers');
  // @ts-expect-error custom edge
  g.addEdge('processEndTopicAnswers', 'checkDone');
  // @ts-expect-error edge typing
  g.addEdge('draftNode', 'groundNode');
  // @ts-expect-error edge typing
  g.addEdge('groundNode', 'finalizeSection');
  // (edge finalizeSection -> checkDone substituída por broadcastAnswers)
  // @ts-expect-error custom edge
  g.addEdge('checkDone', END);
  const compiled = g.compile();
  logger.info({ event: 'lesson_graph_compiled' });
  return compiled;
}

export type LessonGraph = ReturnType<typeof buildLessonGraph>;
