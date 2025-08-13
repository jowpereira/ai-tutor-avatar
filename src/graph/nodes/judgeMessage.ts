import { TrainingState } from '../state.js';
import { logger } from '../../utils/observability.js';

export interface JudgeDecision {
  route: 'CHAT_NOW' | 'QUEUE_BROADCAST' | 'IGNORE';
  needsRAG: boolean;
  reason: string;
  priority?: number;
}

export function judgeMessage(state: TrainingState): Partial<TrainingState> {
  const started = Date.now();
  const q = state.questionsQueue[0];
  if (!q) return {};
  const text = q.content.toLowerCase();
  let decision: JudgeDecision = { route: 'CHAT_NOW', needsRAG: false, reason: 'default' };
  if (text.length > 200 || /explique|detalhe/.test(text)) {
    decision = { route: 'QUEUE_BROADCAST', needsRAG: /cite|fonte|refer/.test(text), reason: 'complex_question', priority: 5 };
  } else if (/citar|fonte|ano|dados/.test(text)) {
    decision = { route: 'CHAT_NOW', needsRAG: true, reason: 'factual_short' };
  } else if (/obrigado|valeu/.test(text)) {
    decision = { route: 'IGNORE', needsRAG: false, reason: 'gratitude' };
  }
  logger.info({ event: 'judge_decision', decision });
  const patch: Partial<TrainingState> = { route: decision.route };
  if (decision.route === 'CHAT_NOW') {
    patch.pendingQuestions = [
      { ...q, needsRAG: decision.needsRAG, priority: decision.priority ?? 0 },
      ...state.pendingQuestions,
    ];
    patch.questionsQueue = state.questionsQueue.slice(1);
  } else if (decision.route === 'QUEUE_BROADCAST') {
    patch.broadcastQueue = [
      { ...q, needsRAG: decision.needsRAG, priority: decision.priority ?? 1 },
      ...state.broadcastQueue,
    ];
    patch.questionsQueue = state.questionsQueue.slice(1);
  } else if (decision.route === 'IGNORE') {
    patch.questionsQueue = state.questionsQueue.slice(1);
  }
  patch.logs = [...state.logs, { node: 'judgeMessage', ms: Date.now() - started }];
  return patch;
}
