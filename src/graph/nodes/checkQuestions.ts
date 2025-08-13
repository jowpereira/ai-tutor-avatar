import { TrainingState } from '../state.js';
import { logger } from '../../utils/observability.js';

export function checkQuestions(state: TrainingState): Partial<TrainingState> {
  const started = Date.now();
  const shouldBroadcast = state.broadcastQueue.length >= 3;
  logger.info({ event: 'check_questions', shouldBroadcast });
  return {
    route: shouldBroadcast ? 'QUEUE_BROADCAST' : state.route,
    logs: [...state.logs, { node: 'checkQuestions', ms: Date.now() - started }],
  };
}
