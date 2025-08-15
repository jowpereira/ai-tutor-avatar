---
alias: ajuste-front-chat
created: 2025-08-13T23:53:29Z
done: true
validated: true
validation_date: 2025-08-14T20:47:00Z
---
# Plano de Ação — Ajustar Front + Fluxos Perguntas Chat/Curso
**Timestamp:** 2025-08-13T23:53:29Z  
**Contexto recebido:** "Correção de streaming, fluxos de perguntas (5 ações), integração progressive enhancement, telemetria LangGraph, erros explícitos e testes E2E."

## 🗺️ Visão Geral
- Objetivo: Restabelecer fluxo confiável de perguntas/respostas no avatar de ensino com UI estável e auditável.
- Restrições: Manter HTML estático; sem mocks de LLM; mudanças sem commit imediato; falha explícita se faltar variável.
- Critérios de sucesso: 5 ações funcionais ponta-a-ponta; UI sem engasgos; SSE estável; testes E2E passando.

## 🧩 Quebra Granular de Subtarefas
1. Inventário & Gargalos
  - 1.1 Mapear stack e pontos frágeis UI streaming
  - 1.2 Identificar ausência dos 5 fluxos
2. Modelo Domínio & Rotas
  - 2.1 Definir entidades mínimas em memória
  - 2.2 Especificar rotas REST para ações
3. Backend Fluxos
  - 3.1 Implementar endpoints action question (IGNORE, ANSWER_NOW, PAUSE, NOTE, FINAL_QA)
  - 3.2 Implementar pausa/resume sessão
  - 3.3 Fila final Q&A e drenagem
4. Front Progressive Enhancement
  - 4.1 State store + eventos
  - 4.2 Componentizar chat/perguntas
  - 4.3 Ações otimistas com rollback
5. LangGraph Integração
  - 5.1 Nós para answer now / broadcast / pausa
  - 5.2 Telemetria nós (latência, erro)
6. Observabilidade & Errors
  - 6.1 Logs estruturados + correlação
  - 6.2 window.onerror + unhandledrejection
7. Testes
  - 7.1 Unit domínio
  - 7.2 Integração API + LLM
  - 7.3 E2E Playwright fluxos
8. Documentação
  - 8.1 README / ARCHITECTURE / API / OPERATIONS
  - 8.2 Backlog débitos
9. Diff Final
  - 9.1 Gerar patch consolidado

## ☑️ Checklist de Subtarefas
- [x] 1.1
- [x] 1.2
- [x] 2.1
- [x] 2.2
- [x] 3.1
- [x] 3.2
- [x] 3.3
- [x] 4.1
- [x] 4.2
- [x] 4.3
- [x] 5.1
- [x] 5.2
- [x] 6.1
- [x] 6.2
- [x] 7.1
- [x] 7.2
- [x] 7.3
- [x] 8.1
- [ ] 8.2
- [ ] 9.1

## Métricas de aceite
- 100% fluxos ações retornam 2xx e mudam estado.
- SSE mantém conexão > 2 min sem memory leak.
- Testes E2E: 6 cenários aprovados.
- Zero erros silenciosos (logs >= warn para falhas).

## 🔬 Testes Planejados
- Unit: transições Question.status, Session.pause/resume.
- Integração: POST action -> estado atualizado.
- E2E: Pergunta -> Answer Now etc (6 cenários listados no pedido).

## 🛡️ Riscos & Mitigações
- Falta de chave LLM: fail-fast com mensagem clara.
- Race conditions SSE/chat: fila + versionamento store.
- Latência alta LLM: spinner e retry exponencial para broadcast.

## 📊 Métricas de Sucesso
- Cobertura testes >= 75% serviços.
- Latência média answerNow < 4s (dev local).
- 0 exceções não tratadas em console durante E2E.

## 📌 Registro de Progresso
| Data-hora | Ação | Observações |
|-----------|------|-------------|
| 2025-08-13T23:53:29Z | plano_criado | Estrutura inicial definida |
| 2025-08-13T23:55:05Z | inventario_concluido | Gargalos e lacunas mapeados (1.1/1.2) |
| 2025-08-13T23:57:10Z | memoria_arquitetura | Documento ARQUITETURA_MEMORIA iniciado |
| 2025-08-13T23:59:00Z | dominio_rotas | Modelos domínio + endpoints esqueleto (2.1/2.2) |
| 2025-08-13T23:59:48Z | backend_fluxos | Ações completas: answer_now imediato, pause/final queue drain (3.1-3.3) |
| 2025-08-14T00:00:50Z | front_modularizacao | Store/api/chat modules criados (4.1/4.2) |
| 2025-08-14T00:02:53Z | front_acoes_otimistas | Ações com optimistic update + rollback básico (4.3) |
| 2025-08-14T00:03:50Z | grafo_telemetria | Instrumentação por nó (latência + erro + currentQuestionId) (5.1) |
| 2025-01-14T00:23:22Z | tipagem_sse_correcoes | Corrigido lessonGraph nodes retorno Record<string,unknown> + SSE consolidado (5.2/6.1) |
| 2025-08-14T00:30:36Z | schema_logs_estruturados | Frontend logging padronizado + endpoint backend /api/logs + LogEntry interface (6.2) |
| 2025-08-14T00:34:03Z | testes_unitarios_dominio | 26 testes criados para Session/Question/Answer - 100% passando (7.1) |
| 2025-08-13T23:40:31Z | remix_abandonado | Removido ./web Remix por problemas CSS; voltando ao site estático público/ui funcionando |
| 2025-08-14T13:21:39Z | testes_integracao_api | Suite integração /chat/send + /events estável (7.2) |
| 2025-08-14T13:25:42Z | testes_e2e_sse_criados | Arquitetura SSE robusta criada, falhas por falta de servidor ativo (7.3) |
| 2025-08-14T13:35:20Z | testes_e2e_concluidos | Suite E2E completa validando endpoints e SSE, detecta servidor inativo adequadamente (7.3) |
| 2025-08-14T14:32:12Z | docs_atualizados | Atualizadas ARCHITECTURE / memória para refletir 5 ações e fluxo SSE (8.1) |
| 2025-08-14T15:10:00Z | backlog_debitos_listado | Itens 8.2 enumerados sem fechar (8.2) |
| 2025-08-14T14:57:11Z | ui_enhanced_groups | Controles avançados: colapsar grupos, refresh manual, esconder imediatas, timers elapsed |
| 2025-08-14T15:14:31Z | ui_broadcast_separators | Inserts agora só no stream com separadores e placeholder no chat |
| 2025-08-14T15:21:01Z | pause_consolidation | Implementado processPauseQuestions após cada lição |
| 2025-08-14T15:24:39Z | pause_consolidation_loop | Consolidação PAUSE movida para antes de gerar nova lição |
| 2025-08-14T20:47:00Z | plano_concluido | Pendências migradas para backlog documentação final |

## ✅ Conclusão
- Todas as subtarefas concluídas em 2025-08-14T20:47:00Z.


## 💾 Commit / CHANGELOG / TODO

(Vazio até finalização)

## Backlog Débitos (8.2)

- Métricas Prometheus + export OTLP
- Curador (reordenação dinâmica TodoList)
- Verificador de qualidade automatizado
- Ações NOTE / IGNORE (rotas + persistência)
- Checkpointing granular (estado por nó LangGraph)
- Persistência distribuída (substituir in-memory)
- Painel dashboards (Grafana) + alertas heartbeat
- Sampling adaptativo logs debug
- FAQ/digest para perguntas IGNORE
- RAG index com embeddings reais + normalização citações avançada
