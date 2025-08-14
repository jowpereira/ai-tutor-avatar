import { TrainingState } from '../state.js';
import { logger } from '../../utils/observability.js';

export interface JudgeDecision {
  route: 'CHAT_NOW' | 'PAUSE' | 'END_TOPIC' | 'IGNORE';
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
  const wantsSummary = /(resumo|conclus|finaliza|overview)/.test(text);
  if (wantsSummary) {
    decision = { route: 'END_TOPIC', needsRAG: /cite|fonte|refer|dados|estat/.test(text), reason: 'summary_request', priority: 5 };
  } else if (text.length > 160 || /explique|detalhe|compar|diferença|porque|por que/.test(text)) {
    decision = { route: 'PAUSE', needsRAG: /cite|fonte|refer|dados|estat|n[úu]mer/.test(text), reason: 'complex_explanation', priority: 4 };
  } else if (/citar|fonte|ano|dados|quando/.test(text)) {
    decision = { route: 'CHAT_NOW', needsRAG: true, reason: 'factual_short' };
  } else if (/obrigado|valeu|thanks/.test(text)) {
    decision = { route: 'IGNORE', needsRAG: false, reason: 'gratitude' };
  }
  logger.info({ event: 'judge_decision', decision });
  const patch: Partial<TrainingState> = { route: decision.route };
  if (decision.route === 'CHAT_NOW') {
    patch.pendingQuestions = [
      { ...q, needsRAG: decision.needsRAG, priority: decision.priority ?? 0, route: decision.route, reason: decision.reason },
      ...state.pendingQuestions,
    ];
    patch.questionsQueue = state.questionsQueue.slice(1);
  } else if (decision.route === 'PAUSE' || decision.route === 'END_TOPIC') {
    patch.broadcastQueue = [
      { ...q, needsRAG: decision.needsRAG, priority: decision.priority ?? 1, route: decision.route, reason: decision.reason },
      ...state.broadcastQueue,
    ];
    patch.questionsQueue = state.questionsQueue.slice(1);
  } else if (decision.route === 'IGNORE') {
    patch.questionsQueue = state.questionsQueue.slice(1);
  }
  patch.logs = [...state.logs, { node: 'judgeMessage', ms: Date.now() - started }];
  return patch;
}
