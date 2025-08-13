import { TrainingState } from '../state.js';
import { logger } from '../../utils/observability.js';

export function pickNextTopic(state: TrainingState): Partial<TrainingState> {
  const started = Date.now();
  const next = state.todo.find((t) => !t.done);
  logger.info({ event: 'pick_next_topic', next: next?.id });
  return {
    currentTopicId: next ? next.id : null,
    logs: [...state.logs, { node: 'pickNextTopic', ms: Date.now() - started }],
  };
}
