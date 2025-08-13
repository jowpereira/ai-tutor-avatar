import { TrainingState } from '../state.js';
import { logger } from '../../utils/observability.js';

export function verifyQuality(state: TrainingState): Partial<TrainingState> {
  const started = Date.now();
  const last = [...state.lessons].pop();
  if (!last) return {};
  last.verified = true;
  logger.info({ event: 'lesson_verified', sectionId: last.id });
  return {
    lessons: [...state.lessons.slice(0, -1), last],
    logs: [...state.logs, { node: 'verifyQuality', ms: Date.now() - started }],
  };
}
