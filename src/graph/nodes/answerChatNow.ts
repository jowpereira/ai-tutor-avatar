import { TrainingState } from '../state.js';
import { ragAgent } from '../../agents/rag.js';
import { logger } from '../../utils/observability.js';

export async function answerChatNow(state: TrainingState): Promise<Partial<TrainingState>> {
  const started = Date.now();
  const q = state.pendingQuestions[0];
  if (!q) return {};
  let answer: string;
  if (q.needsRAG) {
    answer = await ragAgent.answerWithCitations(q.content, state.currentTopicId || undefined);
  } else {
    answer = 'Resposta breve: ' + q.content.slice(0, 200);
  }
  logger.info({ event: 'chat_now_answered', len: answer.length, rag: q.needsRAG });
  return {
    answered: [...state.answered, q.id],
    pendingQuestions: state.pendingQuestions.slice(1),
    logs: [...state.logs, { node: 'answerChatNow', ms: Date.now() - started, rag: q.needsRAG }],
    lessons: state.lessons,
  };
}
