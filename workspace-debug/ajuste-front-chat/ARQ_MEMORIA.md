# Memória de Arquitetura — Ajuste Front + Fluxos Perguntas Chat/Curso

Timestamp inicial: 2025-08-14T00:13:30Z
Plano ativo: ajuste-front-chat

## Estrutura do Documento
- Visão Atual (Inventariada)
- Análises em Progresso
- Próximas Análises Planejadas
- Decisões Tomadas
- Riscos & Mitigações Atualizados
- Log Incremental Detalhado

---
## Visão Atual (Inventariada)
### Backend
- Fastify API: rotas principais em `src/server/routes.ts` (eventos curso, chat, sessão, fila final, SSE streaming).
- Lesson Graph: `src/graph/lessonGraph.ts` usando StateGraph (LangGraph). Nós instrumentados com telemetria (latência, erro, currentQuestionId, sessionId, traceId).
- Lesson Manager: `src/services/lessonManager.ts` orquestra invocações do grafo, persistência incremental JSON, gera sessionId/traceId.
- RAG Agent: `src/agents/rag.ts` fornece `answerWithCitations` e `generateLessonSection`.

### Frontend
- UI Streaming legado em `public/ui/ui.js` (render incremental de lições via SSE /course/stream)
- Chat modular (novos arquivos): `store.js`, `api.js`, `chat.js` (estado reativo simples, ações otimistas, envio pergunta e ações)
- SSE adicional emitindo eventos `answer` + correlação.

### Domínio Perguntas/Sessão
- In-memory: perguntas classificadas com rotas (CHAT_NOW, PAUSE, END_TOPIC, IGNORE, FINAL_QA via ação)
- Ações REST: criação, ação, notas, pause/resume, final queue drain.

### Observabilidade
- Logger central (pino wrapper) em `utils/observability.ts` (detalhes ainda a validar).
- Telemetria por nó (logs estruturados) + correlação sessionId/traceId.

---

## Análises em Progresso

- ~~Normalização tipagem LogEntry e remoção de `any` residual em grafo e manager.~~ ✅ CONCLUÍDO
- ~~Consolidação de única conexão SSE para UI + Chat.~~ ✅ CONCLUÍDO  
- Integração sessionId entre lessonManager e endpoints de perguntas (sincronização pendente).
- Schema de logs estruturados padronizado (formato final a documentar).

---

## Próximas Análises Planejadas

1. **Revisão de consistência sessão vs lessonManager** (sincronizar sessionId gerado ao iniciar curso com endpoints de perguntas).
2. **Estratégia de reprocessamento** de perguntas roteadas PAUSE/END_TOPIC (garantia de idempotência).
3. **Modelo de erros**: mapear pontos que ainda retornam 500 genérico -> códigos específicos.
4. **Planejar testes** (unit/integration/E2E) focando fluxos das 5 ações.
5. **Documentar contratos SSE** (eventos: lesson, log, answer, done, error) + formato padronizado.

---
## Decisões Tomadas
| Data | Decisão | Motivação | Impacto |
|------|---------|-----------|---------|
| 2025-08-14T00:13:30Z | Telemetria por nó via wrapper instrument | Auditar transições LangGraph | Logs consistentes para métricas posteriores |
| 2025-08-14T00:13:30Z | sessionId/traceId no lessonManager | Correlação ponta-a-ponta backend | Facilita debug multi-request |
| 2025-08-14T00:13:30Z | SSE incluir respostas (answer events) | Evitar polling para chat | Menor latência de resposta |

---
## Riscos & Mitigações Atualizados
| Risco | Probabilidade | Impacto | Mitigação Atual |
|-------|---------------|---------|-----------------|
| Duplicidade SSE (duas conexões) | Média | Recursos/estado divergente | Consolidar fonte única antes de testes |
| Qualidade tipagem frágil (any) | Alta | Erros ocultos | Refatorar tipos LogEntry e NodePatch |
| Falta de retomada após erro SSE | Média | Experiência ruim | Implementar retry exponencial cliente |
| Broadcast PAUSE/END_TOPIC sem dedupe | Baixa | Respostas duplicadas | Set answeredIds já presente – revisar testes |

---

## Log Incremental Detalhado

| Timestamp | Categoria | Detalhe |
|-----------|-----------|---------|
| 2025-08-14T00:13:30Z | INIT | Documento de memória criado |
| 2025-01-14T00:23:22Z | Tipagem | Corrigidos todos os nodes em lessonGraph para retornar Record<string,unknown> |
| 2025-01-14T00:23:22Z | SSE | Consolidação finalizada: chat.js usa eventos window em vez de conexão duplicada |
| 2025-01-14T00:23:22Z | UI | ui.js dispatch eventos customizados 'sse-answer' para integração chat |
| 2025-08-14T00:30:36Z | Logging | Schema estruturado implementado: LogEntry interface + FrontendLogger + endpoint /api/logs |
| 2025-08-14T00:34:03Z | Testes | 26 testes unitários de domínio criados - Session/Question transitions + integração |
| 2025-08-14T00:39:00Z | Chat Fix | CRÍTICO: Corrigido envio Enter + botão Enviar - event listeners robustos + rotas JS backend |

---
(Atualize este arquivo a cada bloco de trabalho)

