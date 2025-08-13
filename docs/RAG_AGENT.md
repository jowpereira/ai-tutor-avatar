# RAG Agent Specification

## Inventário de Fontes
- Repositório técnico interno
- Documentação pública oficial
- Slides de aulas passadas

## Ingestão
- Normalização para Markdown
- Limpeza de HTML, remoção de boilerplate

## Chunking
- Tamanho alvo: 200–400 tokens
- Overlap: 40 tokens
- Heurística: quebrar por heading > parágrafos

## Embeddings
- Modelo: placeholder `text-embedding-model`
- Estratégia: cache em disco (futuro: vetor DB)

## Índice
- Híbrido: BM25 + Vetorial (futuro) — stub atual retorna mock

## Políticas de Uso
| Situação | Nível |
|----------|------|
| Pergunta factual | Obrigatório |
| Conceito genérico | Recomendado |
| Pergunta logística | Opcional |

## Grounding
`ground(draft, n)` reforça afirmações com citações [[ref:N]].

## Formato de Citação
`[[ref:1]]` sequencial por documento distinto.

## Métricas
- precision@K
- groundedness score (LLM judge)
- latency média

## SLOs
- p95 `retrieve` < 1200ms
- p95 `answerWithCitations` < 2500ms

## Governança
- Revisão mensal de fontes
- Auditoria de drift semântico

## Fallbacks
- Se retrieve vazio -> resposta parcial + disclaimer
- Se ground falha -> manter draft original + log warning
