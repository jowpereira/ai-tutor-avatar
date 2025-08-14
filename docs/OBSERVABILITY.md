# Observabilidade

Camada de telemetria cobre: eventos estruturados (emitidos no código), eventos SSE enviados ao cliente, métricas (a instrumentar), e logs pino.

## 1. Eventos Internos (App / Graph)

| Evento | Descrição | Campos |
|--------|-----------|--------|
| message_ingested | Mensagem recebida | participantId, size |
| judge_decision | Classificação pergunta | route, needsRAG, reason, forceOverride? |
| chat.classify_raw | Heurística bruta antes de mapping | text, length |
| chat_now_answered | Resposta imediata concluída | tokens, latencyMs |
| enqueued_broadcast | Pergunta enfileirada para pausa | priority, queueSize |
| broadcast_flushed | Perguntas drenadas em pausa | count, latencyMs |
| inserts_buffer_flush | Buffer inserts enviado | size |
| graph_invoke_start | Nó do LangGraph iniciando | node, sessionId |
| graph_invoke_success | Nó concluído | node, durationMs |
| graph_invoke_error | Falha em nó | node, error, durationMs |
| rag.retrieve | Retrieve docs | query, hits |
| rag.ground | Grounding lição | refs |

## 2. Eventos SSE (wire protocol)

| Evento | Quando | Campos |
|--------|-------|--------|
| heartbeat | Imediato e ~1s interval | ts, uptimeMs |
| log | Cada registro relevante | level, message |
| lesson | Nova/atualização de lição | lessonId, segment, delta? |
| insert | Resposta curta (pausa/final tóp.) | type (PAUSE ou END_TOPIC), questionId, answer |
| done | Fim do stream (rota final ou erro controlado) | reason |
| error | Erro não-recuperável | message |

Observação: cliente deve tolerar heartbeat ausente por até 2 intervalos antes de considerar desconectado.

## 3. Métricas (Backlog)

- Counters: perguntas_totais, perguntas_chat_now, perguntas_pause, perguntas_end_topic
- Histogramas: latência_resposta_chat_now_ms, latência_classificação_ms, latência_nó_ms
- Gauge: sse_conexoes_ativas
- Ratio (posterior): erros_por_pergunta

## 4. Logs Estruturados

Formato pino (one-line JSON). Chaves mínimas: `time, level, event, msg, sessionId?`.

Exemplo:

```json
{"level":30,"event":"judge_decision","route":"CHAT_NOW","needsRAG":false,"forceOverride":false}
```

## 5. forceRoute (Determinismo Testes)

Campo opcional em POST /chat/send que força `route` (ex: `PAUSE`, `END_TOPIC`) registrando `forceOverride:true` em `judge_decision` para distinguir de decisão natural.

## 6. Boas Práticas Consumidor SSE

- Re-conectar exponencial (base 500ms, cap 5s) após close não-intencional
- Validar heartbeat dentro de janela 2500ms
- Processar `insert` idempotente (usar questionId)
- Ao receber `done`, fechar clean e persistir último offset

## 7. Roadmap Observabilidade

| Item | Status |
|------|--------|
| Métricas Prometheus | PENDENTE |
| Export OTLP traces | PENDENTE |
| Sampling adaptativo logs debug | PENDENTE |
| Painel dashboards (Grafana) | PENDENTE |
| Alerta heartbeat ausente | PENDENTE |

