import { TrainingState } from '../state.js';
import { logger, count, startTimer } from '../../utils/observability.js';

export function ingestTodo(state: TrainingState, input?: any): Partial<TrainingState> {
  const stop = startTimer('node.ingestTodo');
  if (!input?.todo || !Array.isArray(input.todo)) {
    logger.warn({ event: 'ingest_todo_invalid' });
    return {};
  }
  logger.info({ event: 'todo_ingested', count: input.todo.length });
  count('todo_ingested');
  const result = {
    todo: input.todo,
    currentTopicId: input.todo[0]?.id ?? null,
    logs: [...state.logs, { node: 'ingestTodo' }],
  };
  stop();
  return result;
}
