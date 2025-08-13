import { TrainingState } from '../state.js';
import { logger, count, startTimer } from '../../utils/observability.js';

interface MessageInput { participantId: string; content: string; }

export function ingestMessage(state: TrainingState, input?: { message?: MessageInput }): Partial<TrainingState> {
  const stop = startTimer('node.ingestMessage');
  if (!input?.message) return {};
  const q = {
    id: `q_${Date.now()}`,
    participantId: input.message.participantId,
    content: input.message.content,
    needsRAG: false,
    priority: 0,
    createdAt: Date.now(),
  };
  logger.info({ event: 'message_ingested', len: input.message.content.length });
  count('message_ingested');
  const result = {
    questionsQueue: [...state.questionsQueue, q],
    participants: state.participants.includes(q.participantId)
      ? state.participants
      : [...state.participants, q.participantId],
  logs: [...state.logs, { node: 'ingestMessage' }],
  };
  stop();
  return result;
}
