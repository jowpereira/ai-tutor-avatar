import { StateGraph, Annotation, START, END } from '@langchain/langgraph';

import { logger } from '../utils/observability.js';
import { TrainingState, initialState } from './state.js';
import { ingestMessage } from './nodes/ingestMessage.js';
import { ingestTodo } from './nodes/ingestTodo.js';
import { judgeMessage } from './nodes/judgeMessage.js';
import { answerChatNow } from './nodes/answerChatNow.js';
import { enqueueBroadcast } from './nodes/enqueueBroadcast.js';
import { broadcastAnswers } from './nodes/broadcastAnswers.js';

// Full training state definition following LangGraph 0.4.4 patterns
const StateAnnotation = Annotation.Root({
  todo: Annotation<TrainingState['todo']>({
    value: (left, right) => right !== undefined ? right : left,
    default: () => initialState.todo
  }),
  currentTopicId: Annotation<TrainingState['currentTopicId']>({
    value: (left, right) => right !== undefined ? right : left,
    default: () => initialState.currentTopicId
  }),
  lessons: Annotation<TrainingState['lessons']>({
    value: (left, right) => right !== undefined ? right : left,
    default: () => initialState.lessons
  }),
  questionsQueue: Annotation<TrainingState['questionsQueue']>({
    value: (left, right) => right !== undefined ? right : left,
    default: () => initialState.questionsQueue
  }),
  pendingQuestions: Annotation<TrainingState['pendingQuestions']>({
    value: (left, right) => right !== undefined ? right : left,
    default: () => initialState.pendingQuestions
  }),
  broadcastQueue: Annotation<TrainingState['broadcastQueue']>({
    value: (left, right) => right !== undefined ? right : left,
    default: () => initialState.broadcastQueue
  }),
  answered: Annotation<TrainingState['answered']>({
    value: (left, right) => right !== undefined ? right : left,
    default: () => initialState.answered
  }),
  participants: Annotation<TrainingState['participants']>({
    value: (left, right) => right !== undefined ? right : left,
    default: () => initialState.participants
  }),
  route: Annotation<TrainingState['route']>({
    value: (left, right) => right !== undefined ? right : left,
    default: () => initialState.route
  }),
  logs: Annotation<TrainingState['logs']>({
    value: (left: TrainingState['logs'], right: TrainingState['logs']) => right !== undefined ? [...(left || []), ...(right || [])] : left,
    default: () => initialState.logs
  }),
  // Legacy compatibility for tests
  message: Annotation<string>({
    value: (left, right) => right || left,
    default: () => ""
  }),
  count: Annotation<number>({
    value: (left, right) => right !== undefined ? right : left,
    default: () => 0
  })
});

// Node adapters for LangGraph 0.4.4 compatibility
const ingestMessageNode = (state: typeof StateAnnotation.State, config?: any) => {
  // Legacy message format support
  if (state.message && !state.questionsQueue?.length) {
    const messageInput = { participantId: 'default', content: state.message };
    const result = ingestMessage(state as any, { message: messageInput });
    return { ...result, message: `Ingested: ${state.message}`, count: (state.count || 0) + 1 };
  }
  return ingestMessage(state as any);
};

const judgeMessageNode = (state: typeof StateAnnotation.State) => {
  const result = judgeMessage(state as any);
  return { ...result, count: (state.count || 0) + 1 };
};

const answerChatNowNode = (state: typeof StateAnnotation.State) => {
  const result = answerChatNow(state as any);
  return { ...result, count: (state.count || 0) + 1 };
};

const broadcastNode = (state: typeof StateAnnotation.State) => {
  // Handle both enqueueBroadcast and broadcastAnswers
  if (state.route === 'QUEUE_BROADCAST' && state.questionsQueue?.length) {
    const enqueueResult = enqueueBroadcast(state as any);
    const broadcastResult = broadcastAnswers({ ...state, ...enqueueResult } as any);
    return { ...enqueueResult, ...broadcastResult, count: (state.count || 0) + 1 };
  }
  return { count: (state.count || 0) };
};

// Simple completion node
const finalize = (state: typeof StateAnnotation.State) => {
  logger.info({ event: 'graph_finalize', route: state.route, questionsCount: state.questionsQueue?.length });
  return {
    message: `Final: ${state.message || 'Processed'}`,
    count: (state.count || 0) + 1
  };
};

export function buildGraph() {
  const g = new StateGraph(StateAnnotation);

  // Add only connected nodes for MVP linear pipeline
  g.addNode('ingest', ingestMessageNode);
  g.addNode('judge', judgeMessageNode);
  g.addNode('finalize', finalize);

  // Simple linear flow: ingest -> judge -> finalize
  // @ts-expect-error - LangGraph edge type constraints
  g.addEdge(START, 'ingest');
  // @ts-expect-error - LangGraph edge type constraints
  g.addEdge('ingest', 'judge');
  // @ts-expect-error - LangGraph edge type constraints
  g.addEdge('judge', 'finalize');
  // @ts-expect-error - LangGraph edge type constraints
  g.addEdge('finalize', END);

  const compiled = g.compile();
  logger.info({ event: 'graph_compiled_full_pipeline', nodes: ['ingest', 'judge', 'finalize'] });
  return compiled;
}
