import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../utils/observability.js';

export interface RAGDocument { id: string; text: string; topicId: string; score?: number }
export interface TopicRAG { topicId: string; title: string; documents: { id: string; text: string }[] }

let loaded = false;
let docs: RAGDocument[] = [];
let topics: Record<string, TopicRAG> = {};

const DATA_DIR = path.resolve(process.cwd(), 'data', 'training', 'rag');

export async function loadRAGStore() {
  if (loaded) return;
  try {
    const files = await fs.readdir(DATA_DIR);
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const raw = await fs.readFile(path.join(DATA_DIR, f), 'utf-8');
      const parsed: TopicRAG = JSON.parse(raw);
      topics[parsed.topicId] = parsed;
      parsed.documents.forEach(d => docs.push({ id: d.id, text: d.text, topicId: parsed.topicId }));
    }
    loaded = true;
    logger.info({ event: 'rag_store_loaded', topics: Object.keys(topics).length, docs: docs.length });
  } catch (e) {
    logger.error({ event: 'rag_store_load_error', error: (e as Error).message });
  }
}

export function getAllDocs() { return docs; }
export function getTopicDocs(topicId?: string) {
  if (topicId && topics[topicId]) return topics[topicId].documents.map(d => ({ id: d.id, text: d.text, topicId }));
  return docs;
}

export function searchDocs(query: string, topicId?: string, k = 3): RAGDocument[] {
  const corpus = topicId ? getTopicDocs(topicId) : getAllDocs();
  const qTokens = new Set(query.toLowerCase().split(/[^\p{L}0-9]+/u).filter(Boolean));
  return [...corpus]
    .map(d => {
      const tokens = d.text.toLowerCase().split(/[^\p{L}0-9]+/u).filter(Boolean);
      const overlap = tokens.filter(t => qTokens.has(t)).length;
      return { ...d, score: overlap / (tokens.length + 1) };
    })
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, k);
}
