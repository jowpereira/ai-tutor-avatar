# TODO Granular

## Fase 0 - Infra
- [ ] Criar schema env (zod)
- [ ] Implementar carregamento dotenv
- [ ] Adicionar logger pino wrapper

## Fase 1 - Estado & Grafo
- [ ] Definir TrainingState (zod)
- [ ] Implementar state patch util
- [ ] Registrar nós no StateGraph
- [ ] Implementar checkpointer in-memory

## Fase 2 - Nós Base
- [ ] ingestTodo
- [ ] pickNextTopic
- [ ] pickNextSubtask
- [ ] outline
- [ ] draftLesson
- [ ] augmentLessonWithRAG
- [ ] verifyQuality
- [ ] finalizeTopic

## Fase 3 - Chat Paralelo
- [ ] ingestMessage
- [ ] judgeMessage
- [ ] answerChatNow
- [ ] enqueueBroadcast
- [ ] broadcastAnswers
- [ ] checkQuestions decision

## Fase 4 - RAG
- [ ] Implementar retrieve
- [ ] Implementar ground
- [ ] Implementar answerWithCitations

## Fase 5 - Observabilidade
- [ ] Eventos centralizados
- [ ] Métricas stub
- [ ] Contadores por rota

## Fase 6 - Testes
- [ ] Unit: cada nó
- [ ] Integration: CHAT_NOW fluxo
- [ ] Integration: QUEUE_BROADCAST fluxo
- [ ] Integration: needsRAG true/false
- [ ] Cobertura >= 70%

## Fase 7 - Qualidade
- [ ] ESLint pass
- [ ] Prettier pass
- [ ] semantic-release dry run
