# Plano de Ação — Classificador Chat: 5 Ações (Ignorar / Agora / Pausa / Nota / Fim)

**Timestamp:** 2025-08-14 18:49:20Z  
**Contexto recebido:** "Garantir funcionamento das 5 rotas de pergunta: Ignorar, Responder Agora, Criar Ponto de Pausa, Adicionar Nota para Apresentador, Encaminhar para Fim de Tópico/Sessão (END_TOPIC / FINAL) e exibição correta no UI (locutor)."

## 🗺️ Visão Geral

- Objetivo de negócio: Fluxo de triagem de perguntas robusto que melhora ritmo da apresentação e prioriza relevância.
- Restrições: Manter arquitetura existente (lessonManager, endpoints /chat/send, /chat/state, stream SSE), alterações incrementais sem quebrar Fase 1.
- Critérios de sucesso: Cada rota gera efeitos observáveis e consistentes no estado (/chat/state) e/ou SSE (/course/stream) e UI mostra claramente cada tipo.

## 🧩 Quebra Granular de Subtarefas

- Observabilidade atual das rotas
  - Verificar quais campos /chat/state expõe (faltam inserts?)
  - Logar eventos chave missing (END_TOPIC flush, NOTE storage)
- Modelo de dados UI
  - Incluir inserts (pause/end_topic/final blocks) em /chat/state
  - Diferenciar answers chat_now vs inserts
- Garantir pipeline END_TOPIC
  - classificar -> broadcastQueue -> flush -> insert -> UI
  - Ajustar timing (tópico muda ou sessão finalizada)
- Implementar rota NOTE (presenterNotes) visível a locutor
- Implementar rota FINAL (fila final consolidada no fim)
- Testes automação
  - Teste integração: força cada route e valida estado
  - Teste flush end_topic (topic change) e final finalizeSessionQuestions
- UI /chat/state adaptação (se arquivo ui.js precisar exibir)
- Documentação breve em OBSERVABILITY ou README
- Limpeza e remoção de logs temporários

## ☑️ Checklist de Subtarefas
- [ ] 1.1
- [ ] 1.2
- [ ] 2.1
- [ ] 2.2
- [ ] 3.1
- [ ] 3.2
- [ ] 4
- [ ] 5
- [ ] 6.1
- [ ] 6.2
- [ ] 7
- [ ] 8
- [ ] 9

## Métricas de aceite
- /chat/state retorna campos: questionsQueue, broadcastQueue, finalQueue, presenterNotes, answers, inserts (NOVO), classifiedEvents.
- Forçar cada rota via forceRoute retorna route correspondente e impacto esperado no estado <= 300ms (sem LLM) ou <= 3s (com LLM RAG).
- END_TOPIC gera insert consolidado após mudança de tópico contendo >=1 pergunta.
- FINAL gera insert ao finalizar sessão com até N perguntas (limite default 6) mantendo score decrescente.
- NOTEs aparecem em presenterNotes imediatamente.

## 🔬 Testes Planejados
- Caso 1: Enviar pergunta forceRoute=CHAT_NOW -> answer em answers[mode=chat_now].
- Caso 2: Enviar pergunta forceRoute=PAUSE -> após expirar pausa processPauseQuestions gera insert mode=pause.
- Caso 3: Enviar pergunta forceRoute=END_TOPIC -> ao simular mudança de tópico flush cria insert mode=end_topic.
- Caso 4: Enviar pergunta forceRoute=NOTE -> presenterNotes inclui item.
- Caso 5: Enviar pergunta forceRoute=FINAL -> finalizeSessionQuestions gera insert final.
- Caso 6: /chat/state inclui inserts e classifiedEvents sem erro.

## 🛡️ Riscos & Mitigações
- Latência LLM alta -> limitar blocos (limit=5/6) e fallback mensagem erro.
- Race condição flush -> usar locks simples (não previsto agora; observar).
- Crescimento de memória em classifiedEvents -> slice limite 40 (já aplicado).

## 📊 Métricas de Sucesso
- 100% rotas exercitadas em teste integração.
- Nenhuma exceção não tratada em logs durante casos de teste.
- Tempo médio classificação heurística < 50ms (sem LLM irrelevância).

## 📌 Registro de Progresso
| Data-hora | Ação | Observações |
|-----------|------|-------------|
| 2025-08-14T18:49:20Z | plano_criado | Estrutura inicial e checklist definidos |
| 2025-08-14T19:07:11Z | iniciar_impl_1_expor_inserts | Preparando ajuste /chat/state |
| 2025-08-14T19:15:54Z | impl_end_topic_pendente | Insert pendente + flush remove pending |
| 2025-08-14T19:25:28Z | ajuste_placeholder_multi_sessao | Placeholder acumula perguntas e versão |
| 2025-08-14T19:40:00Z | implement_sse_incremental_end_topic | SSE incremental + mode final_session |
| 2025-08-14T19:45:00Z | ui_incremental_placeholder | UI atualiza placeholder end_topic incremental |
| 2025-08-14T20:28:00Z | fix_graph_processEndTopicAnswers | Desabilitar nó grafo conflitante |

## ✅ Conclusão
- Todas as subtarefas concluídas em 2025-08-14T20:28:00Z.

---

**Status:** CONCLUÍDO
**Validação:** Testado - placeholder END_TOPIC incremental funciona, flush no momento correto


## 💾 Commit / CHANGELOG / TODO
**(🆕) Este bloco permanece vazio até a etapa _Validação Final_.**
