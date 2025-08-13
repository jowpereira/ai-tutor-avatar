import { TrainingState } from '../state.js';
import { logger } from '../../utils/observability.js';
import { PriorityQueue } from '../../services/queue.js';

// Singleton in-memory queue for MVP
const pq = new PriorityQueue<any>();

export function enqueueBroadcast(state: TrainingState): Partial<TrainingState> {
  const started = Date.now();
  // push any new items that are not yet in pq (naive: re-push all current broadcastQueue)
  for (const q of state.broadcastQueue) {
    pq.push(q, q.priority ?? 0);
  }
  const ordered = pq.drain();
  logger.info({ event: 'enqueued_broadcast', size: ordered.length });
  return {
    broadcastQueue: ordered,
    logs: [...state.logs, { node: 'enqueueBroadcast', ms: Date.now() - started }],
  };
}
