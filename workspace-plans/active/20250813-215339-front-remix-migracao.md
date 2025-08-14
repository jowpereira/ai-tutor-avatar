# Plano de Ação — Migração Front para Remix

**Timestamp:** 2025-08-13 21:53:39  
**Contexto recebido:** "Migrar frontend atual (HTML/Scripts + Fastify static) para arquitetura Remix full framework visando flexibilidade, simplicidade e evolução futura (SSE, chat, lessons, ações)."

## 🗺️ Visão Geral

- Objetivo de negócio: Evoluir UI para framework com melhor DX, reuso de componentes, SSR/streaming nativo e base escalável para features (chat reativo, painéis, logs, controle sessão).
- Restrições: Backend Fastify existente deve continuar servindo API atual sem ruptura. Migração incremental sem quebrar rota /api/stream e endpoints.
- Critérios de sucesso: Página Remix substitui UI atual; chat funciona (Enter e botão) com SSE; estado inicial carregado via loader; build isolado em /web; documentação atualizada.

## 🧩 Quebra Granular de Subtarefas

1. Preparação & Ambiente
  - 1.1 Definir estrutura monorepo parcial (/web)
  - 1.2 Adicionar package Remix + tsconfig
  - 1.3 Scripts npm e dependências mínimas
2. Tipagem & Modelos
  - 2.1 Mapear tipos Session/Question/Answer/Lesson
  - 2.2 Criar types.ts alinhado com backend
3. Infra HTTP Cliente
  - 3.1 api.ts com wrapper fetch + erros
  - 3.2 sse.ts para EventSource + reconexão
4. Estado Global
  - 4.1 Decidir store (Zustand)
  - 4.2 Implementar useChatStore slices
5. Rotas Remix
  - 5.1 Rota raiz _index loader snapshot
  - 5.2 Action envio pergunta
  - 5.3 Hook useSSE integrando store
6. Componentização
  - 6.1 ChatInput (form + progressive enhancement)
  - 6.2 MessageList (render ordenado)
  - 6.3 StatusBar (session/pause)
  - 6.4 LessonPanel (lição atual + próximas)
7. Integração Funcional
  - 7.1 Conectar SSE a store
  - 7.2 Atualizar UI em eventos (answer, lesson, broadcast)
  - 7.3 Tratamento reconexão/backoff
8. Estilo & UX
  - 8.1 Config Tailwind (opcional aprovado) 
  - 8.2 Layout responsivo básico
9. Observabilidade UI
  - 9.1 Logger cliente integrando /api/logs
10. Testes
  - 10.1 Unit components (Vitest + RTL)
  - 10.2 Integração loader/action
  - 10.3 E2E Playwright cenário chat happy path
11. Migração Final
  - 11.1 Redirecionar antiga UI para Remix
  - 11.2 Atualizar README e docs/memory
  - 11.3 Limpeza scripts legacy (se aplicável)

## ☑️ Checklist de Subtarefas

- [x] 1.3
- [x] 2.1
- [x] 2.2
- [x] 3.1
- [x] 3.2
- [x] 4.1
- [x] 4.2
- [x] 5.1
- [x] 5.2
- [x] 5.3
- [x] 6.1
- [x] 6.2
- [x] 6.3
- [x] 6.4
- [x] 7.1
- [x] 7.2
- [ ] 7.3 (reconexão avançada: jitter, limite, botão manual)
- [x] 7.3 (reconexão avançada: jitter, limite, botão manual)
- [x] 8.1
 - [x] 8.2 (layout responsivo grid + mobile stacking)
- [x] 9.1
- [x] 10.1
 - [ ] 10.2 (parcial integração loader/action ok; falta SSE streaming)
- [ ] 10.3
- [ ] 11.1
- [ ] 11.2
- [ ] 11.3

### 🔀 Itens Fundidos do Plano "Ajustar Front + Fluxos Perguntas Chat/Curso"

Pendências incorporadas (mantêm numeração de origem para rastreio):

- [ ] AFC 7.2 Integração API + LLM (complementar aos testes de streaming 10.2)
- [ ] AFC 7.3 E2E Playwright fluxos completos (abrange 10.3)
- [ ] AFC 8.1 Atualizar README / ARCHITECTURE / API / OPERATIONS (cobrirá 11.2)
- [ ] AFC 8.2 Backlog débitos técnicos (estender 11.3)
- [ ] AFC 9.1 Gerar patch consolidado (será parte da finalização / changelog)

### 🆕 Fase Ações Interativas (Perguntas 5 Caminhos)

- [x] AI 1 API Client Wrappers
- [x] AI 2 Store Estendida (questions/notes/finalQueue/session)
- [x] AI 3 Backend Broadcast SSE eventos perguntas/notas/sessão/finalQueue
- [x] AI 4 Componentes QuestionList / NotesPanel / FinalQueuePanel / SessionBar
- [ ] AI 5 Fluxo Optimistic + Rollback
- [ ] AI 6 Docs Fluxo Perguntas (README + ARCHITECTURE)
- [ ] AI 7 Testes Integração/Ações + SSE store
- [ ] AI 8 E2E Playwright (cobre 5 caminhos) (integra 10.3 / AFC 7.3)
- [ ] AI 9 Unificar dev script (backend+front)
- [ ] AI 10 Redirect /ui → /
- [ ] AI 11 Patch consolidado + CHANGELOG

## Métricas de aceite

- Chat operacional (Enter + botão) sem reload.
- SSE conectado > 2 min sem erro.
- Loader inicial entrega snapshot em < 200ms (local).
- Primeira resposta render < 5s após envio pergunta (pipeline atual).

## 🔬 Testes Planejados

- Caso 1: Action enviar pergunta -> retorna 303/redirect + state atualizado via SSE.
- Caso 2: Reconexão SSE após fechar manualmente -> restabelece eventos.
- Caso 3: Render inicial sem perguntas -> UI vazia sem erros.
- Caso 4: Receber broadcast lesson update -> LessonPanel atualiza.
- Caso 5 (E2E): Fluxo completo pergunta -> answerNow exibida.

## 🛡️ Riscos & Mitigações

- Divergência tipos backend: centralizar em types.ts e validar com testes contrato.
- Reconexão SSE ruidosa: backoff exponencial + limite.
- CORS/API base: usar variável API_BASE em env.
- Regressão UI legacy: manter rota antiga até 11.1 concluída.

## 📊 Métricas de Sucesso

- 0 erros uncaught no console em E2E.
- Cobertura componentes >= 70% lines.
- Reconexões SSE <= 1 durante teste prolongado 2 min.

## 📌 Registro de Progresso

| Data-hora | Ação | Observações |
|-----------|------|-------------|
| 2025-08-13T21:53:39Z | plano_criado | Estrutura inicial e escopo definidos |
| 2025-08-13T21:54:40Z | setup_remix | Estrutura /web criada, deps e configs base (1.1-1.3) |
| 2025-08-13T21:55:25Z | tipos_api | types.ts criado (2.1-2.2) |
| 2025-08-13T21:55:55Z | infra_http | api.ts e sse.ts implementados (3.1-3.2) |
| 2025-08-13T21:57:05Z | estado_store | Zustand store e hook SSE integrados (4.1-4.2,5.3) |
| 2025-08-13T21:57:45Z | loader_action_chatinput | Loader snapshot, action sendQuestion e ChatInput (5.1-5.2,6.1) |
| 2025-08-13T21:58:40Z | componentes_ui | MessageList, StatusBar, LessonPanel (6.2-6.4) |
| 2025-08-13T21:59:50Z | sse_refino_tailwind | Deduplicação store, reconexão SSE e Tailwind base (7.1-7.2,8.1) |
| 2025-08-13T22:01:10Z | logger_ui | Logger global + capturas error/unhandledrejection (9.1) |
| 2025-08-13T22:01:40Z | teste_unit_basico | Teste smoke ChatInput (10.1) |
| 2025-08-13T22:17:16Z | layout_base | Estrutura grid inicial com LessonPanel/MessageList (início 8.2) |
| 2025-08-13T22:17:16Z | reconexao_avancada_inicial | Planejada melhoria jitter/backoff (início 7.3) |
| 2025-08-13T22:18:35Z | reconexao_impl_step | Iniciando implementação reconnect manual + store flag (7.3) |
| 2025-08-13T22:20:41Z | reconexao_finalizada | Backoff jitter + botão reconectar funcional (7.3 concluído) |
| 2025-08-13T22:20:41Z | layout_responsivo_start | Início ajustes breakpoints e mobile stacking (8.2) |
| 2025-08-14T01:28:19Z | layout_responsivo_done | Grid + scroll painéis e container (8.2 concluído) |
| 2025-08-14T01:28:19Z | testes_unit_cleanup | Removido teste unit isolado substituído por integração (10.2 parcial) |
| 2025-08-13T22:20:41Z | testes_integracao_start | Preparação harness testes loader/action (10.2) |
| 2025-08-14T01:50:00Z | fusao_planos | Plano 'Ajustar Front Chat' fundido; pendências mapeadas (AFC 7.2..9.1) |
| 2025-08-14T02:00:00Z | fase_acoes_init | Ações interativas aprovadas e fase iniciada (AI 1-11 planejado) |
| 2025-08-14T02:10:00Z | sse_cleanup_obsolete_bind | Removidos binds duplicados após refatoração bindTyped (nenhuma subtarefa marcada) |
| 2025-08-14T02:12:30Z | tsconfig_include_web | Adicionado 'web' ao include para resolver tipos frontend |
| 2025-08-14T02:15:00Z | tipos_correcoes_finais | Corrigidos tipos QuestionList/useSSE/api/testes; AI 1-4 concluídas |
| 2025-08-14T02:20:00Z | tailwind_postcss_fix | Corrigido PostCSS config; ambos serviços (3001/3000) operacionais |
| 2025-08-14T02:25:00Z | css_pure_fix | Removido Tailwind, criado CSS puro; frontend build sem erros |
| 2025-08-14T02:30:00Z | layout_classes_fix | Substituído classes Tailwind por CSS puro; layout grid funcional |

## 💾 Commit / CHANGELOG / TODO

**(🆕) Este bloco permanece vazio até a etapa _Validação Final_.**
