# Arquitetura Detalhada

## Visão Geral
StateGraph (LangGraph) coordena nós para produção incremental de aulas. Paralelamente um pipeline de mensagens mantém interações em tempo real sem bloquear a geração de conteúdo.

## Estado (Zod)
Campos principais em `src/graph/state.ts`:
- todo[]: estrutura hierárquica ingerida
- currentTopicId
- lessons: map topicId -> { sections: [...], finalized }
- questionsQueue: perguntas aguardando classificação
- pendingQuestions: perguntas aguardando resposta
- broadcastQueue: fila priorizada
- answered[]
- participants[]
- route: última rota de decisão
- logs[]: eventos internos

## Nós
Descritos no README. Cada nó recebe estado e retorna patch parcial. Logs estruturados com timestamp, nome do nó, duração ms.

## Decisões
- LangGraph escolhido pela flexibilidade de compor condicionalmente nós.
- Estado in-memory inicialmente para simplicidade (futuro: Redis / Postgres).
- RAG abstraído em agente para permitir troca de provider sem tocar nós centrais.

## Eventos
Ver `docs/OBSERVABILITY.md`.

## Segurança
Validação de ENV com Zod. Sem segredos em logs.

## RAG
`retrieve` -> documentos candidatos; `ground` -> injeta citações em draft; `answerWithCitations` -> resposta focal citável.

## Pausas & Broadcast
`checkQuestions` decide se executa `broadcastAnswers` baseado em (timer, tamanho fila, fim de seção).
