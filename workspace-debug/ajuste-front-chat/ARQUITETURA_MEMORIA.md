# Memória Arquitetural — Ajuste Front + Fluxos Perguntas

## Estrutura do Documento
- Contexto Atual
- Componentes Identificados
- Fluxos Existentes
- Lacunas & Riscos
- Estratégia de Evolução (Planejada)
- Execução Incremental (Logs)
- Próximos Itens de Análise

## 1. Contexto Atual (Snapshot Inicial)
Sistema gera curso via LangGraph (lessonGraph) e expõe SSE para UI; chat parcialmente implementado. Ausência dos 5 fluxos completos. Estado central em lessonManager com foco em lições, acoplado a classificação de perguntas.

## 2. Componentes Identificados
### Backend
- Fastify server (app.ts / routes.ts)
- lessonManager (estado em memória + persistência JSON)
- Graphs: buildGraph (genérica), buildLessonGraph (lições)
- Agents: ragAgent, judge (classificação perguntas simples)
- Observabilidade: logger + snapshotMetrics (mínimo)
### Frontend
- HTML estático + ui.js monolítico (stream + chat + progress + digitação)
- CSS minimalista
### Persistência
- Arquivo JSON: data/training/generated-lessons.json
- Todos (input): data/training/todos/todos.json
### Testes Atuais
- Specs existentes (não cobrem 5 ações) — não inventariados profundamente ainda (TODO analisar coverage focada)

## 3. Fluxos Existentes
1. Iniciar curso: POST /events (build_course) -> lessonManager.init -> usuário clica stream -> SSE /course/stream gera lições.
2. Pergunta: POST /chat/send -> classifica (CHAT_NOW/IGNORE/PAUSE/END_TOPIC parcial) -> se CHAT_NOW tenta gerar answer via lessonManager.next step.
3. Polling estado chat: GET /chat/state (fila + respostas recentes).

## 4. Lacunas & Riscos
- Falta de entidades: Session, PausePoint, PresenterNote, FinalQueueItem.
- Falta de endpoints específicos para ações (apenas /chat/send).
- LangGraph não modela rotas de ação; lógica fora do grafo (lessonManager.answerNowLLM manual).
- UI sem IDs por pergunta para interações futuras.
- Erros silenciosos em fetchChatState e submit chat (comentários /* ignore */).
- Não há mecanismo de pausa real: status de sessão inexiste.

## 5. Estratégia de Evolução (Planejada)
1. Introduzir domínio completo (Session + Question.status + action-specific arrays) sem quebrar compat.
2. Rotas REST padronizadas com códigos de erro semânticos.
3. Refatorar LangGraph criando nós dedicados: ingestQuestion -> judge -> routeEdge -> answerNow / queuePause / queueFinal / ignore.
4. Telemetria por nó (start_ts, end_ts, ms, error|null) anexada ao log state.
5. Front: separar state.js, api.js, stream.js, chat.js; criar store com version increment.
6. Ações de pergunta com botões e optimistic update + rollback.
7. Testes: domínio (transições), integração (rotas), E2E (6 fluxos).

## 6. Execução Incremental (Logs)
| Timestamp | Etapa | Detalhe | Artefatos/Impacto |
|-----------|-------|---------|-------------------|
| 2025-08-13T23:53:29Z | Plano | Criação plano ativo | workspace-plans/active/... |
| 2025-08-13T23:55:05Z | Inventário | Gargalos streaming & chat mapeados | ARQUITETURA_MEMORIA.md inicial |
| 2025-08-13T23:57:10Z | Memória | Documento de memória arquitetural criado | Este arquivo |
| 2025-08-13T23:59:00Z | Domínio | SessionState + endpoints base (questions/actions/pause/final) | routes.ts |
| 2025-08-14T00:00:50Z | Front Modular | store.js, api.js, chat.js, stream.js criados; ui.js limpo | public/ui/* |

## 7. Próximos Itens de Análise
- Incorporar telemetria nó-a-nó no lessonGraph (start/end/ms, correlationIds questionId/sessionId).
- Extender graph para ingestQuestion -> judge node destacada.
- Implementar optimistic rollback detalhado (exibir erro visual) para ações no front (4.3 pendente).
- Preparar harness de testes de domínio (estado sessão vs question transitions).
- Hardening: remover any / ajustar lint e adicionar tipos nas novas rotas.

(Atualize incrementalmente a cada subtarefa relevante.)
