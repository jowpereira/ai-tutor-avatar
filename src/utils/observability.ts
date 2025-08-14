import pino from 'pino';

// Schema padronizado de logs
export interface LogEntry {
  event: string;
  sessionId?: string;
  traceId?: string;
  timestamp?: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  duration?: number;
  metadata?: Record<string, unknown>;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
}

// Função para formatar logs de forma mais legível
function formatLog(obj: Record<string, unknown>): void {
  const timestamp = new Date().toISOString().substring(11, 19); // HH:MM:SS
  const level = obj.level === 30 ? 'INFO' : obj.level === 40 ? 'WARN' : obj.level === 50 ? 'ERROR' : 'DEBUG';
  const event = (obj.event as string) || 'unknown';
  
  let message = `🔷 ${timestamp} [${level}] ${event.toUpperCase()}`;
  
  // Adicionar contexto importante de forma limpa
  const ctx: string[] = [];
  if (obj.qid) ctx.push(`qid=${obj.qid}`);
  if (obj.route) ctx.push(`route=${obj.route}`);
  if (obj.text && typeof obj.text === 'string') {
    const shortText = obj.text.length > 40 ? obj.text.substring(0, 40) + '...' : obj.text;
    ctx.push(`"${shortText}"`);
  }
  if (obj.hasAnswer !== undefined) ctx.push(`answered=${obj.hasAnswer ? 'YES' : 'NO'}`);
  if (obj.responseTime && typeof obj.responseTime === 'number') ctx.push(`${Math.round(obj.responseTime)}ms`);
  if (obj.currentTopic) ctx.push(`topic=${obj.currentTopic}`);
  if (obj.autoProcessed !== undefined) ctx.push(`auto=${obj.autoProcessed}`);
  if (obj.needsRAG !== undefined) ctx.push(`rag=${obj.needsRAG}`);
  
  if (ctx.length > 0) {
    message += ` (${ctx.join(' | ')})`;
  }
  
  if (obj.error) {
    message += ` ❌ ${obj.error}`;
  }
  
  console.log(message);
}

// Logger com formatação personalizada mais simples
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  hooks: {
    logMethod(inputArgs, method) {
      if (inputArgs.length > 0 && typeof inputArgs[0] === 'object' && inputArgs[0] !== null) {
        const obj = inputArgs[0] as Record<string, unknown>;
        formatLog(obj);
      }
      return method.apply(this, inputArgs);
    }
  }
});

// Helper para logs estruturados com validação
export function logStructured(entry: Omit<LogEntry, 'timestamp'>) {
  const logData = {
    ...entry,
    timestamp: new Date().toISOString(),
  };
  
  // Validação básica
  if (!entry.event || typeof entry.event !== 'string') {
    logger.warn({ event: 'invalid_log_entry', reason: 'missing_event', entry });
    return;
  }
  
  switch (entry.level) {
    case 'debug': logger.debug(logData); break;
    case 'info': logger.info(logData); break;
    case 'warn': logger.warn(logData); break;
    case 'error': logger.error(logData); break;
  }
}

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
