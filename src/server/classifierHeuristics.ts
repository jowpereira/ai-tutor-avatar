export interface LLMClassResult {
  route: string;
  topicRelevance: string; // CURRENT|PAST|FUTURE|OUT_OF_SCOPE
  needsRAG: boolean;
  reason?: string;
}

export interface IrrelevanceLLMResult {
  irrelevant: boolean;
  confidence: number; // 0-1
  rationale: string;
}

export type FinalRoute = 'IGNORE' | 'NOTE' | 'FINAL' | 'END_TOPIC' | 'CHAT_NOW' | 'PAUSE';

interface IrrelevanceHeuristicResult {
  decided: boolean; // true se heurística decidiu irrelevância
  irrelevant: boolean;
  reason?: string;
  score: number; // quanto mais negativo, mais irrelevante
  uncertain: boolean; // se true, pode acionar LLM fallback
}

// Cache simples (TTL 60s) para decisões de irrelevância por texto normalizado
const IRRELEVANCE_CACHE = new Map<string, { ts: number; result: boolean; reason: string }>();
const IRRELEVANCE_TTL = 60_000; // 1 minuto conforme solicitação

function normalizeKey(text: string) {
  return text
    .toLowerCase()
  .replace(/["'`*_~-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function heuristicIrrelevance(textRaw: string, recentIgnored: string[]): IrrelevanceHeuristicResult {
  const text = textRaw.trim();
  const key = normalizeKey(text);
  const letters = key.replace(/[^a-zà-ú0-9?]/gi, '');
  let score = 0;
  // Penalidades
  if (!letters) score -= 5; // vazio
  if (/^[?¿¡!]+$/.test(text)) score -= 4; // só pontuação interrogativa/exclamativa
  if (text.length < 3) score -= 3;
  if (/^(ok|blz|vlw|valeu|thanks?|obg)$/i.test(key)) score -= 3;
  // Simplificação: se composta apenas de emoji(s) básicos (intervalos gerais) - evita lista explícita que causa lint
  if (/^(?:[\p{Emoji_Presentation}\p{Emoji}]+)$/u.test(text)) score -= 4;
  // Duplicado recente ignorado
  if (recentIgnored.includes(key)) score -= 4;

  // Indícios de relevância
  if (/\?/.test(text)) score += 1;
  if (/(como|qual|quais|quando|onde|por que|porque|exemplo|diferença|usar|fazer)\b/i.test(key)) score += 2;
  if (text.length >= 15) score += 1;

  // Decisão
  if (score <= -3) {
    return { decided: true, irrelevant: true, reason: 'heuristic:score_'+score, score, uncertain: false };
  }
  // Zona de incerteza: textos curtos 3-12 chars sem verbo interrogativo
  const uncertain = text.length >= 3 && text.length <= 12 && !/(como|qual|por que|porque|onde|quando)\b/i.test(key);
  return { decided: false, irrelevant: false, reason: undefined, score, uncertain };
}

export function cacheIrrelevanceGet(text: string) {
  const key = normalizeKey(text);
  const hit = IRRELEVANCE_CACHE.get(key);
  if (hit && Date.now() - hit.ts < IRRELEVANCE_TTL) {
    return hit;
  }
  if (hit) IRRELEVANCE_CACHE.delete(key);
  return null;
}
export function cacheIrrelevanceSet(text: string, result: boolean, reason: string) {
  IRRELEVANCE_CACHE.set(normalizeKey(text), { ts: Date.now(), result, reason });
}

export function determineRoute(textRaw: string, llm: LLMClassResult): { route: FinalRoute; needsRAG: boolean } {
  const text = textRaw.trim();
  const lower = text.toLowerCase();
  const isQuestion = /\?/.test(text);
  const len = text.length;
  const isGreeting = /^(obrigado|valeu|ok|blz|beleza|oi|ol[áa]|boa noite|bom dia|boa tarde)\b/.test(lower);
  const askEndTopic = /(finaliza|finalize|resumo|encerrar|concluir).*/i.test(text);
  const askFinalSession = /(ao?\s*fim\s*(da|do)\s*(sess[aã]o|curso)|no final.*sess[aã]o|no final.*curso)/i.test(text);
  const isNote = /(anota(r)?|nota|registrar|considerar|melhorar|ajustar|talvez incluir)/i.test(lower) && !isQuestion;

  const llmBase = (['CHAT_NOW','PAUSE','END_TOPIC','IGNORE'].includes(llm.route) ? llm.route : 'IGNORE') as 'CHAT_NOW'|'PAUSE'|'END_TOPIC'|'IGNORE';
  let route: FinalRoute = llmBase as FinalRoute;
  // Deterministic overrides
  if (isGreeting) route = 'IGNORE';
  else if (isNote) route = 'NOTE';
  else if (askFinalSession) route = 'FINAL';
  else if (askEndTopic) route = 'END_TOPIC';
  else if ((llm.topicRelevance === 'FUTURE' || llm.topicRelevance === 'OUT_OF_SCOPE') && !isQuestion) route = 'IGNORE';
  else if (!isQuestion && len < 60) route = 'IGNORE';
  else if (isQuestion && len < 140) route = 'CHAT_NOW';
  else if (isQuestion && len >= 140 && len < 300) route = 'PAUSE';
  else if (isQuestion && len >= 300) route = 'END_TOPIC';

  return { route, needsRAG: llm.needsRAG && route !== 'IGNORE' };
}

export function truncateRationale(rationale?: string, max = 180) {
  if (!rationale) return undefined;
  return rationale.length > max ? rationale.slice(0, max) + '…' : rationale;
}
