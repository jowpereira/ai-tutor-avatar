# Observabilidade

## Eventos
| Evento | Descrição | Campos |
|--------|-----------|--------|
| message_ingested | Mensagem recebida | participantId, size |
| judge_decision | Resultado de classificação | route, needsRAG, reason |
| chat_now_answered | Resposta imediata | tokens, latencyMs |
| enqueued_broadcast | Pergunta enfileirada | priority, queueSize |
| broadcast_done | Broadcast executado | count, latencyMs |
| rag.retrieve | Execução de retrieve | query, hits |
| rag.ground | Grounding de lição | refs |

## Métricas (Stub)
- Contadores por evento
- Histogramas de latência

## Logs
Formato JSON: `{ ts, level, event, data }`.

## Exemplos
```json
{"event":"judge_decision","route":"CHAT_NOW","needsRAG":false}
```
