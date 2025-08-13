// Proposta (-alterar): melhorias no RAG Agent
// - Deduplicação de citações
// - Resumo de contexto antes de enviar ao LLM
// - Score normalizado e corte por threshold
// Não utilizado ainda.

import { ragAgent } from '../agents/rag.js';

export interface RankedDoc { id: string; text: string; score: number }

export async function proposedRetrieveWithThreshold(query: string, topicId?: string, minScore = 0.01) {
  const docs = await (ragAgent as any).retrieve(query, topicId);
  return docs.filter((d: any) => (d.score || 0) >= minScore);
}

export function dedupCitations(text: string) {
  const seen = new Set<string>();
  return text.replace(/\[\[ref:([^\]]+)\]\]/g, (_m, g1) => {
    if (seen.has(g1)) return '';
    seen.add(g1);
    return `[[ref:${g1}]]`;
  });
}

export async function prototypeAnswer(query: string, topicId?: string) {
  const docs = await proposedRetrieveWithThreshold(query, topicId);
  const context = docs.map((d: any, i: number) => `(${i + 1}) ${d.text}`).join('\n');
  const base = await (ragAgent as any).answerWithCitations(query, topicId);
  return dedupCitations(base) + '\n\nContexto Utilizado:\n' + context;
}
