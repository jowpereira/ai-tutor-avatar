# Plano de Ação — Implementação MVP Sistema Agentic de Treinamento
**Timestamp:** 2025-08-12 00:00:00
**Status:** draft
**Relacionado à Especificação:** `workspace-plans/completed/sistema-agentic-treinamento-langchain.md`

## 🎯 Objetivo Geral
Entregar um MVP funcional do sistema agentic de treinamento capaz de:
- Gerar conteúdo (outline + draft + verificação) para um tópico simples
- Ingerir mensagens do usuário e classificá-las (CHAT_NOW / QUEUE_BROADCAST / IGNORE)
- Responder imediatamente (CHAT_NOW) com opção de RAG (stub) e enfileirar broadcasts
- Persistir estado em memória (fase MVP) com estrutura pronta para futura persistência

## 📦 Escopo (MVP)
Incluído:
- Grafo principal com nós essenciais (ingestTodo, pickNextTopic, outline, draftLesson, verifyQuality, finalizeTopic)
- Pipeline de mensagens (ingestMessage, judgeMessage, answerChatNow, enqueueBroadcast, broadcastAnswers)
- RAG stub operando em modo simulado (sem vetor DB real)
- API HTTP mínima (Fastify) com rotas /health, /events (ingest todo + mensagens)
- Observabilidade básica (logs estruturados + contadores in-memory)
- Testes unitários e integração principais (≥70% cobertura)

Excluído (próximas fases):
- Persistência em banco / vector store real
- Autenticação / autorização
- Escalabilidade horizontal / clustering
- Métricas externas (Prometheus, OpenTelemetry completo)

## ✅ Critérios de Pronto (Definition of Done)
- Todos os nós MVP implementados e testados
- Julgador retorna consistentemente uma das 3 classes com estrutura {decision, reason}
- Resposta imediata suporta ramo com/sem RAG (controle por flag env)
- Broadcast processa fila em ordem e drena corretamente
- Scripts: `dev`, `build`, `test`, `lint` funcionam sem erros
- Cobertura de testes >= 70% global
- Documentação README atualizada refletindo estado MVP

## 📊 Métricas de Sucesso (MVP)
| Métrica | Alvo |
|---------|------|
| Cobertura de testes | ≥ 70% |
| Tempo médio resposta CHAT_NOW (simulado) | < 500ms |
| Falhas de execução por 100 execuções de nós | 0 críticas |
| Precisão heurística do julgador (amostra manual) | ≥ 80% |

## 🧱 Arquitetura (Resumo MVP)
- Orquestração: LangGraph StateGraph (in-memory)
- Validação: Zod schemas (estado + env)
- Server: Fastify (JSON APIs)
- Observabilidade: Pino logger + contadores simples
- RAG: Stub com documentos sintéticos e citações [[ref:N]]
- Estado: Estruturas em memória (arrays) — sem persistência

## 🗂️ Componentes Prioritários
1. Estado & Schemas (TrainingState, Lesson, Question, Message)
2. Nós de Conteúdo (outline → draftLesson → verifyQuality → finalizeTopic)
3. Fluxo de Mensagens (ingestMessage → judgeMessage → answerChatNow | enqueueBroadcast → broadcastAnswers)
4. RAG Stub (retrieve, ground, answerWithCitations)
5. API /events (ingest todo + message + optional flush broadcast)
6. Testes (unit e integração)
7. Observabilidade (eventos padronizados)

## ⚠️ Riscos & Mitigações
| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Julgador heurístico impreciso | Rotas erradas | Ajustar regras + testes de amostra |
| Crescimento de estado in-memory | OOM futuro | Limites / limpeza por tamanho |
| Acoplamento entre nós | Dificulta evolução | Interfaces e patches imutáveis |
| Falta de persistência | Perda total em crash | Planejar adapter storage Fase 2 |

## 🔄 Fluxos Chave (MVP)
1. Geração de Conteúdo: ingestTodo → pickNextTopic → outline → draftLesson → verifyQuality (loop se baixa qualidade) → finalizeTopic
2. Mensagem CHAT_NOW: ingestMessage → judgeMessage(decision=CHAT_NOW) → answerChatNow (+ opcional RAG)
3. Mensagem Broadcast: ingestMessage → judgeMessage(decision=QUEUE_BROADCAST) → enqueueBroadcast → (loop periódico) broadcastAnswers
4. Ignorada: ingestMessage → judgeMessage(decision=IGNORE)

## 🔧 Ambiente
Variáveis .env (MVP):
- NODE_ENV
- RAG_ENABLED=true|false
- OPENAI_API_KEY (placeholder; não usada no stub)

## 🧪 Estratégia de Testes
Tipos:
- Unit: Cada nó com cenários (happy path + edge)
- Integration: Fluxos (CHAT_NOW, QUEUE_BROADCAST com draining, RAG on/off)
- Heurística Julgador: Tabela de exemplos
Cobertura: Limite no Vitest + relatório textual

## 🧩 Pendências Técnicas para Próximas Fases
- Persistência (KV / DB)
- Vector Store real (Chroma / Pinecone / LanceDB)
- Autenticação (API key / JWT)
- Observabilidade avançada (tracing / métricas externas)
- Rate limiting e QoS

## ☑️ Checklist de Subtarefas (Detalhado)

Legenda: (D) depende de tarefa anterior | (CR) Critério de Aceite | (R) Risco associado

### 1. Setup & Dependências
- [ ] 1.1 Instalar dependências de runtime (langchain, @langchain/langgraph, fastify, zod, dotenv, pino)
- [ ] 1.2 Instalar dependências de dev (typescript, tsup, vitest, @types/node, eslint*, prettier, commitlint, husky, lint-staged, ts-node)
- [ ] 1.3 Verificar versões Node >= 20 e engines no package.json
- [ ] 1.4 Executar `npm run lint` (CR: zero erros; só warnings permitidos <= 5)
- [ ] 1.5 Executar `npm run build` (CR: saída dist/ gerada com .d.ts)
- [ ] 1.6 Configurar script de coverage no package.json (`test:cov`)
- [ ] 1.7 Adicionar vitest.config.(ts|mjs) com threshold 70% (D: 1.6)

### 2. Estado & Schemas
- [ ] 2.1 Revisar `TrainingState` garantindo imutabilidade (usar retornos de patch sem mutação direta)
- [ ] 2.2 Adicionar schema para Message (se ainda implícito) com enum validated
- [ ] 2.3 Validar schema de Lesson com campo qualityScore opcional controlado somente por verifyQuality
- [ ] 2.4 Criar função helper `applyPatch(state, patch)` central (CR: logs delta size)
- [ ] 2.5 Adicionar guard rails (limite máx mensagens = 500, broadcasts = 200) (R: OOM)

### 3. Orquestração (LangGraph)
- [ ] 3.1 Definir nós obrigatórios no builder com tipagem forte
- [ ] 3.2 Implementar roteamento condicional pós `judgeMessage` (CHAT_NOW → answerChatNow, QUEUE_BROADCAST → enqueueBroadcast, IGNORE → fim)
- [ ] 3.3 Adicionar loop periódico para `broadcastAnswers` (simulado via função scheduler in-memory)
- [ ] 3.4 Adicionar verificação de invariantes (CR: no final de cada execução `state` satisfaz schema)
- [ ] 3.5 Incluir marcador de versão do grafo em estado (`graphVersion`)

### 4. Implementação de Nós
- [ ] 4.1 ingestTodo (CR: adiciona 1 todo com uuid e status "pending")
- [ ] 4.2 pickNextTopic (CR: escolhe primeiro pending; marca status "in_progress")
- [ ] 4.3 outline (CR: gera >=3 bullet points; salva em lesson.outline)
- [ ] 4.4 draftLesson (CR: gera texto >= 200 chars; referencia outline)
- [ ] 4.5 verifyQuality (CR: calcula qualityScore 0..1; se <0.6 adiciona motivo em lesson.reviewNotes)
- [ ] 4.6 finalizeTopic (CR: status do todo "done"; lesson marcada finalizada)
- [ ] 4.7 ingestMessage (CR: normaliza whitespace; timestamp obrigatório)
- [ ] 4.8 judgeMessage (CR: retorna {decision, reason}; decision ∈ set; latência < 50ms)
- [ ] 4.9 answerChatNow (CR: se RAG_ENABLED adiciona citações [[ref]]; cria registro em answers)
- [ ] 4.10 enqueueBroadcast (CR: insere item em priority queue com score calculado)
- [ ] 4.11 broadcastAnswers (CR: drena <= N (config) por execução; marca broadcastedAt)
- [ ] 4.12 checkQuestions (CR: identifica interrogações não respondidas; popula pendingQuestions)
- [ ] 4.13 augmentLessonWithRAG (CR: injeta blocos citados; não duplica citações)

### 5. Priority Queue & Broadcast
- [ ] 5.1 Substituir uso de array por PriorityQueue service (D: 4.10)
- [ ] 5.2 Implementar função de scoring (ex: recency + length penalty)
- [ ] 5.3 Adicionar limite de reprocessamento (maxRetries=2)
- [ ] 5.4 Teste de estabilidade: enfileirar 100 itens e drenar (CR: ordem decrescente de score)

### 6. RAG Stub
- [ ] 6.1 Parametrizar número de documentos sintéticos (env: RAG_DOCS=3)
- [ ] 6.2 Adicionar função `cite(docId, span)` para consistência de formato
- [ ] 6.3 Implementar verificação `groundingScore` simples (proporção tokens citados)
- [ ] 6.4 Expor métricas RAG (docsFetched, avgGroundingScore)
- [ ] 6.5 Teste needsRAG=true vs false (CR: branch coverage > 90% nesse módulo)

### 7. API Layer (Fastify)
- [ ] 7.1 DTOs com Zod para /events (action: ingest_todo, ingest_message, flush_broadcast)
- [ ] 7.2 Handler ingest_todo → dispara pipeline de conteúdo se idle
- [ ] 7.3 Handler ingest_message → executa sub-grafo messageFlow
- [ ] 7.4 Handler flush_broadcast → força chamada broadcastAnswers
- [ ] 7.5 Middleware de erro padronizado (CR: JSON {error, code})
- [ ] 7.6 Rate limit simples (token bucket in-memory) (R: abuso)

### 8. Observabilidade
- [ ] 8.1 Definir enum EVENT_TYPES (node.start, node.end, decision.judge, queue.enqueue, queue.drain)
- [ ] 8.2 Incrementar contadores em cada nó (execuções, falhas)
- [ ] 8.3 Medir duração por nó (hrtime) (CR: log ms arredondado)
- [ ] 8.4 Expor endpoint /metrics (JSON simples MVP)
- [ ] 8.5 Adicionar correlação requestId (header ou gerado)
- [ ] 8.6 Teste: simular 10 execuções e validar métricas agregadas

### 9. Testes
- [ ] 9.1 Unit: Cada nó (happy path)
- [ ] 9.2 Unit: Nós com erros simulados (ex: verifyQuality retorna score NaN)
- [ ] 9.3 Unit: PriorityQueue (inserção, estabilidade, desempate)
- [ ] 9.4 Unit: RAG groundingScore limites (0, 1)
- [ ] 9.5 Integration: Fluxo conteúdo completo (todo → lesson final)
- [ ] 9.6 Integration: Mensagem CHAT_NOW RAG off
- [ ] 9.7 Integration: Mensagem CHAT_NOW RAG on (citações presentes)
- [ ] 9.8 Integration: Broadcast queue com drenagem parcial (limit N)
- [ ] 9.9 Integration: Stress 50 mensagens mistas (CR: nenhuma exceção)
- [ ] 9.10 Coverage Report >= 70% global & >= 60% branches

### 10. Documentação & DX
- [ ] 10.1 Atualizar README (estado atual + como rodar fluxo demo)
- [ ] 10.2 Adicionar SECTION "Decision Matrix" do julgador
- [ ] 10.3 Gerar diagrama Mermaid atualizado (grafo condicional)
- [ ] 10.4 Criar docs/TESTING.md (estratégia e como executar)
- [ ] 10.5 Criar docs/OBSERVABILITY.md (refletindo métricas finais)
- [ ] 10.6 Exemplos curl para endpoints (README ou docs/API.md)

### 11. Qualidade & Release
- [ ] 11.1 Configurar husky pre-commit (lint-staged + vitest --changed)
- [ ] 11.2 commitlint validando Conventional Commits
- [ ] 11.3 Adicionar semantic-release dry-run no CI para PRs
- [ ] 11.4 Badge de coverage no README (shields.io local stub se offline)
- [ ] 11.5 Verificar reprodutibilidade: remover dependências não usadas

### 12. Segurança & Hardening
- [ ] 12.1 Validar que nenhum segredo real é logado
- [ ] 12.2 Sanitizar input message (limitar length, remover control chars)
- [ ] 12.3 Defensive coding: try/catch em cada nó crítico com fallback
- [ ] 12.4 Auditoria de dependências (npm audit --production) (CR: 0 high)
- [ ] 12.5 Configurar cabeçalhos básicos (Fastify helmet se incluído futura fase)

### 13. Preparação Fase 2
- [ ] 13.1 Definir interface de StorageAdapter (saveState/loadState)
- [ ] 13.2 Especificar VectorStoreAdapter interface
- [ ] 13.3 Identificar pontos de extração (onde persistir patches)
- [ ] 13.4 Desenhar plano de migração in-memory → persistente
- [ ] 13.5 Criar backlog entries para cada componente Fase 2

### 14. Revisão Final / DoD
- [ ] 14.1 Rodar pipeline completo local (script demo)
- [ ] 14.2 Validar métricas finais atingidas
- [ ] 14.3 Checklist cruzado com Critérios de Pronto
- [ ] 14.4 Marcar plano como done: true (gatilho validação)
- [ ] 14.5 Gerar changelog entrada MVP

### 15. Rastreabilidade
- [ ] 15.1 Mapear cada nó → teste(s) correspondente(s) em tabela
- [ ] 15.2 Mapear requisitos funcionais → seção README
- [ ] 15.3 Garantir links cruzados (docs <-> código) através de anchors

### 16. Observações (Notas de Execução)
- Manter granularidade: marcar cada subitem ao concluir para feedback incremental
- Evitar merges grandes sem verificação de cobertura
- Priorizar caminhos de erro cedo para evitar regressões tardias

### Resumo de Dependências Críticas
| Tarefa | Depende de |
|--------|------------|
| 3.2 Roteamento condicional | 4.8 judgeMessage |
| 5.1 PriorityQueue | 4.10 enqueueBroadcast |
| 6.5 Teste RAG on/off | 6.1, 6.3 |
| 9.10 Coverage final | 9.1..9.9 |
| 14.4 Marcar done | 14.1..14.3 |

### Critérios Globais de Aceite (Consolidação)
- Zero erros de lint (warnings <=5)
- Build gera tipos e não emite erros TS
- Cobertura ≥ 70% linhas / ≥ 60% branches / módulos críticos ≥ 80% (nós + RAG)
- Todos endpoints respondem < 300ms (simulado) sob carga leve (10 req/s)
- Nenhuma dependência High severity aberta
- Logs estruturados contêm: timestamp, level, event, durationMs (quando aplicável)

---
Nota: Caso algum item precise ser despriorizado, mover para seção "Pendências Técnicas" ou backlog com justificativa.

## 📌 Registro de Progresso
| Data-hora | Ação | Status |
|-----------|------|--------|
| 2025-08-12 00:00 | Plano MVP criado | ✅ |

## 👣 Próximos Passos Imediatos
1. Instalar dependências npm e garantir scripts ok
2. Implementar roteamento condicional no grafo
3. Escrever/ajustar testes faltantes + ativar limiar cobertura
4. Integrar PriorityQueue no broadcastAnswers

---
*Este plano permanecerá em active/ até conclusão e validação.*
