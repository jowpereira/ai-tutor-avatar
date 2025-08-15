import { ChatOpenAI } from '@langchain/openai';

import { logger } from '../utils/observability.js';
import { loadEnv } from '../config/env.js';
import { loadRAGStore, searchDocs, getTopicDocs, RAGDocument } from '../services/ragStore.js';

let chatModel: ChatOpenAI | null = null;
(() => {
  const env = loadEnv();
  // gpt-5-nano não suporta temperature != 1 
  if (env.MODEL_NAME === 'gpt-5-nano') {
    chatModel = new ChatOpenAI({ modelName: env.MODEL_NAME });
  } else {
    chatModel = new ChatOpenAI({ modelName: env.MODEL_NAME, temperature: 0.2 });
  }
  logger.info({ event: 'rag.llm_initialized', model: env.MODEL_NAME });
})();

class RAGAgent {
  async classifyQuestion(question: string, ctx: { currentTopic?: string; futureTopics?: string[] }) {
    if (!chatModel) throw new Error('LLM não inicializado');
    const futureList = (ctx.futureTopics || []).filter(Boolean).slice(0, 8).join('\n- ');
    const prompt = `Classifique a pergunta de um aluno sobre um curso.
Retorne STRICT JSON com as chaves: topicRelevance (CURRENT|PAST|FUTURE|OUT_OF_SCOPE), route (CHAT_NOW|PAUSE|END_TOPIC|IGNORE), needsRAG (true|false), reason (string curta).
Regras:
1. FUTURE se falar explicitamente de tópicos futuros listados.
2. OUT_OF_SCOPE se não relaciona a nenhum tópico (atual ou futuros) ou é social.
3. Se pede um resumo/conclusão → route=END_TOPIC (apenas se relevance CURRENT ou PAST).
4. Perguntas muito curtas objetivas → route=CHAT_NOW.
5. Perguntas analíticas/explicações medianas → route=PAUSE.
6. FUTURE ou OUT_OF_SCOPE → route=IGNORE.
7. needsRAG true se exige comparação, dados, estatísticas, "por que", fontes.
Contexto:
Tópico atual: ${ctx.currentTopic || 'N/A'}
Tópicos futuros potenciais:\n- ${futureList || 'Nenhum'}
Pergunta: "${question}"
JSON:`;
    let raw = '';
    const resp = await chatModel.invoke(prompt);
    raw = (resp?.content as string) || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}$/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    
    return {
      topicRelevance: parsed.topicRelevance || 'CURRENT',
      route: parsed.route || 'PAUSE',
      needsRAG: !!parsed.needsRAG,
      reason: parsed.reason || 'llm'
    } as { topicRelevance: string; route: string; needsRAG: boolean; reason: string };
  }
  async classifyIrrelevance(question: string) {
    if (!chatModel) throw new Error('LLM não inicializado');
    const prompt = `Determine se o texto do usuário deve ser tratado como IRRELEVANTE para um curso técnico atual.
Regras IRRELEVANTE: vazio, só pontuação, só emoji, agradecimento curto sem pergunta, fora de escopo claro, spam.
Se for pergunta técnica ou potencialmente útil => RELEVANTE.
Retorne JSON: {"irrelevant":true|false, "confidence":0-1, "rationale":"string curta"}
Texto: "${question}"\nJSON:`;
    const resp = await chatModel.invoke(prompt);
    const raw = (resp?.content as string) || '{}';
    const match = raw.match(/\{[\s\S]*\}$/);
    const parsed = JSON.parse(match ? match[0] : raw);
    return { irrelevant: !!parsed.irrelevant, confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5, rationale: parsed.rationale || 'llm' } as { irrelevant: boolean; confidence: number; rationale: string };
  }
  async retrieve(query: string, topicId?: string) {
    await loadRAGStore();
    const docs = searchDocs(query, topicId, 3);
    logger.info({ event: 'rag.retrieve', query, hits: docs.length, topicId });
    return docs;
  }

  async ground(draft: string, topicId?: string, n = 3) {
    const docs: RAGDocument[] = await this.retrieve(draft.slice(0, 120), topicId);
    const selected: RAGDocument[] = docs.slice(0, n);
    logger.info({ event: 'rag.ground', refs: selected.length });
    return {
      grounded: draft + '\n' + selected.map((d, i) => `[[ref:${i + 1}:${d.id}]] ${d.text}`).join('\n'),
      refs: selected
    };
  }

  buildContextSnippet(docs: RAGDocument[]) {
    return docs.map((d, i) => `[${i + 1}:${d.id}] ${d.text}`).join('\n');
  }

  async answerWithCitations(question: string, topicId?: string) {
    const docs = await this.retrieve(question, topicId);
    const cite = docs.map((d, i) => `[[ref:${i + 1}:${d.id}]]`).join(' ');
    const ctx = this.buildContextSnippet(docs);
  if (!chatModel) throw new Error('LLM não inicializado');
  const prompt = `Você é um instrutor.
Contexto:
${ctx}
Pergunta: ${question}
Responda em português brasileiro, conciso, incluindo citações inline já no texto usando [[ref:N:docId]].`;
  const res = await chatModel.invoke(prompt);
  const text = (res?.content as string) ?? '';
  return `${text}\nReferências: ${cite}`.trim();
  }

  async generateLessonSection(topicId: string, subtaskTitle: string, goal: string) {
    await loadRAGStore();
    const docs: RAGDocument[] = getTopicDocs(topicId).slice(0, 3) as RAGDocument[];
    const ctx = this.buildContextSnippet(docs);
    if (!chatModel) throw new Error('LLM não inicializado');
    const prompt = `Você está escrevendo conteúdo para ser lido por síntese de voz (TTS).
Metadados:
- Tópico: ${topicId}
- Seção: ${subtaskTitle}
- Objetivo: ${goal}
Contexto (com IDs para citações):
${ctx}
Requisitos de ESTILO (OBRIGATÓRIO seguir todos):
- Frases curtas: ideal 12–20 palavras; nunca exceda 25.
- Fluxo coeso com conectores: "Primeiro", "Em seguida", "Depois", "Portanto", "Por fim" quando adequado.
- Tom didático, claro, neutro; evitar jargão não explicado.
- Sem listas numeradas ou bullets; use parágrafos encadeados.
- Inserir citações no meio do texto somente quando sustentarem uma afirmação, formato [[ref:N:docId]].
- NÃO repetir bloco 'Referências:' ao final.
- NÃO inventar IDs.
- Último parágrafo inicia com "Em resumo," trazendo síntese prática.
Formato de saída: apenas parágrafos em português Brasil, sem cabeçalhos, sem markdown, sem lista de referências final.`;
    const res = await chatModel.invoke(prompt);
    let base = (res?.content as string) || '';
    // Normalização para TTS
    base = base
      .replace(/\.{3,}/g, '…')
      .replace(/\s+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/ {2,}/g, ' ')
      .replace(/Em resumo[,;:]?/i, 'Em resumo,');
    const refs = docs.map((d, i) => `[[ref:${i + 1}:${d.id}]]`).join(' ');
    return { draft: base + `\n\nReferências: ${refs}`, refs: docs };
  }


  async *streamLessonSection(topicId: string, subtaskTitle: string, goal: string) {
    await loadRAGStore();
    const docs: RAGDocument[] = getTopicDocs(topicId).slice(0, 3) as RAGDocument[];
    const ctx = this.buildContextSnippet(docs);
    if (!chatModel) throw new Error('LLM não inicializado');
    const prompt = `Você está escrevendo conteúdo para ser lido por síntese de voz (TTS).
Metadados:
- Tópico: ${topicId}
- Seção: ${subtaskTitle}
- Objetivo: ${goal}
Contexto (com IDs para citações):
${ctx}
Requisitos de ESTILO (OBRIGATÓRIO seguir todos):
- Frases curtas: ideal 12–20 palavras; nunca exceda 25.
- Fluxo coeso com conectores: "Primeiro", "Em seguida", "Depois", "Portanto", "Por fim" quando adequado.
- Tom didático, claro, neutro; evitar jargão não explicado.
- Sem listas numeradas ou bullets; use parágrafos encadeados.
- Inserir citações no meio do texto somente quando sustentarem uma afirmação, formato [[ref:N:docId]].
- NÃO repetir bloco 'Referências:' ao final.
- NÃO inventar IDs.
- Último parágrafo inicia com "Em resumo," trazendo síntese prática.
Formato de saída: apenas parágrafos em português Brasil, sem cabeçalhos, sem markdown, sem lista de referências final.`;
    const stream = await chatModel.stream(prompt);
    let full = '';
    for await (const chunk of stream) {
      const part = (chunk?.content as string) || '';
      if (part) {
        full += part;
        yield { token: part };
      }
    }
  const normalized = full
      .replace(/\.{3,}/g, '…')
      .replace(/\s+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/ {2,}/g, ' ')
      .replace(/Em resumo[,;:]?/i, 'Em resumo,');
    const refs = docs.map((d, i) => `[[ref:${i + 1}:${d.id}]]`);
    yield { end: true, full: normalized, refs };
  }
}

export const ragAgent = new RAGAgent();
