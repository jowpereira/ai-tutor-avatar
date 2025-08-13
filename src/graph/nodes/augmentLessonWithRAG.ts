import { TrainingState } from '../state.js';
import { ragAgent } from '../../agents/rag.js';
import { logger } from '../../utils/observability.js';

export async function augmentLessonWithRAG(state: TrainingState): Promise<Partial<TrainingState>> {
  const started = Date.now();
  const last = [...state.lessons].pop();
  if (!last?.draft) return {};
  const { grounded } = await ragAgent.ground(last.draft, state.currentTopicId || undefined, 3);
  last.grounded = grounded;
  logger.info({ event: 'lesson_grounded', sectionId: last.id });
  return {
    lessons: [...state.lessons.slice(0, -1), last],
    logs: [...state.logs, { node: 'augmentLessonWithRAG', ms: Date.now() - started }],
  };
}
