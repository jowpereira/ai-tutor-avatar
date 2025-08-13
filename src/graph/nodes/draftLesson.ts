import { TrainingState } from '../state.js';
import { logger } from '../../utils/observability.js';

export function draftLesson(state: TrainingState): Partial<TrainingState> {
  const started = Date.now();
  const last = [...state.lessons].pop();
  if (!last) return {};
  last.draft = `Conteúdo inicial para tópico ${last.topicId}.`;
  logger.info({ event: 'draft_created', sectionId: last.id });
  return {
    lessons: [...state.lessons.slice(0, -1), last],
    logs: [...state.logs, { node: 'draftLesson', ms: Date.now() - started }],
  };
}
