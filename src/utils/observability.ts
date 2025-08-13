import pino from 'pino';

export const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const counters: Record<string, number> = {};
interface DurationAgg { count: number; total: number; min: number; max: number; }
const durations: Record<string, DurationAgg> = {};

export function count(event: string) {
  counters[event] = (counters[event] || 0) + 1;
}

export function recordDuration(event: string, ms: number) {
  const agg = durations[event] || { count: 0, total: 0, min: ms, max: ms };
  agg.count += 1;
  agg.total += ms;
  agg.min = Math.min(agg.min, ms);
  agg.max = Math.max(agg.max, ms);
  durations[event] = agg;
}

export function snapshotMetrics() {
  const durationStats = Object.fromEntries(
    Object.entries(durations).map(([k, v]) => [k, { ...v, avg: v.total / v.count }])
  );
  return { counters: { ...counters }, durations: durationStats };
}

export function startTimer(label: string) {
  const started = Date.now();
  return () => recordDuration(label, Date.now() - started);
}
