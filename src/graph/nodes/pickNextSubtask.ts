import { TrainingState } from '../state.js';
import { logger } from '../../utils/observability.js';

export function pickNextSubtask(state: TrainingState): Partial<TrainingState> {
  const started = Date.now();
  const topic = state.todo.find((t) => t.id === state.currentTopicId);
  const sub = topic?.subtasks.find((s) => !s.done);
  logger.info({ event: 'pick_next_subtask', subtask: sub?.id });
  return {
    logs: [...state.logs, { node: 'pickNextSubtask', ms: Date.now() - started }],
  };
}
