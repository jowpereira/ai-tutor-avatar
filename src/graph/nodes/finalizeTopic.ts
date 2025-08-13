import { TrainingState } from '../state.js';
import { logger } from '../../utils/observability.js';

export function finalizeTopic(state: TrainingState): Partial<TrainingState> {
  const started = Date.now();
  const todo = state.todo.map((t) => {
    if (t.id === state.currentTopicId) {
      const allDone = t.subtasks.every((s) => s.done);
      return { ...t, done: allDone };
    }
    return t;
  });
  logger.info({ event: 'topic_finalized', topic: state.currentTopicId });
  return {
    todo,
    logs: [...state.logs, { node: 'finalizeTopic', ms: Date.now() - started }],
  };
}
