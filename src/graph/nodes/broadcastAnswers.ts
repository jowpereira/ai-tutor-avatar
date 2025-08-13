import { TrainingState } from '../state.js';
import { ragAgent } from '../../agents/rag.js';
import { logger } from '../../utils/observability.js';

const MAX_BROADCAST_PER_CYCLE = 10;

export async function broadcastAnswers(state: TrainingState): Promise<Partial<TrainingState>> {
  const started = Date.now();
  if (state.broadcastQueue.length === 0) return {};
  const slice = state.broadcastQueue.slice(0, MAX_BROADCAST_PER_CYCLE);
  const answers = await Promise.all(
    slice.map(async (q: any) => {
      if (q.needsRAG) {
        return ragAgent.answerWithCitations(q.content, state.currentTopicId || undefined);
      }
      return 'Broadcast: ' + q.content.slice(0, 200);
    })
  );
  logger.info({ event: 'broadcast_done', count: answers.length, remaining: state.broadcastQueue.length - slice.length });
  return {
  answered: [...state.answered, ...slice.map((q: any) => q.id) ],
    broadcastQueue: state.broadcastQueue.slice(slice.length),
    logs: [...state.logs, { node: 'broadcastAnswers', ms: Date.now() - started }],
  };
}
