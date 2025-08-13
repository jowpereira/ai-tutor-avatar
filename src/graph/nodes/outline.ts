import { TrainingState } from '../state.js';
import { logger } from '../../utils/observability.js';

export function outline(state: TrainingState): Partial<TrainingState> {
  const started = Date.now();
  const sectionId = `sec_${Date.now()}`;
  const newSection = {
    id: sectionId,
    topicId: state.currentTopicId || 'unknown',
    outline: 'Introdução; Conceitos; Exemplos; Exercícios',
  } as any;
  logger.info({ event: 'outline_created', sectionId });
  return {
    lessons: [...state.lessons, newSection],
    logs: [...state.logs, { node: 'outline', ms: Date.now() - started }],
  };
}
