# 🏗️ Arquitetura do Sistema

## Visão Geral

O Sistema Agentic de Treinamento é construído com arquitetura modular usando padrões modernos de desenvolvimento, priorizando robustez, observabilidade e extensibilidade.

## Stack Tecnológico

### Backend Core
- **Node.js 20+**: Runtime JavaScript moderno
- **TypeScript**: Tipagem estática e desenvolvimento type-safe
- **Fastify**: Framework web de alta performance
- **ESM**: Modules ES6 nativos para compatibilidade moderna

### Inteligência Artificial
- **LangChain**: Framework para desenvolvimento com LLMs
- **LangGraph**: Orquestração de workflows multi-agente
- **OpenAI API**: Modelos de linguagem (GPT-3.5-turbo/GPT-4)
- **Vector Embeddings**: Busca semântica para RAG

### Frontend & UI
- **HTML5 Estático**: Progressive Enhancement
- **Server-Sent Events**: Real-time streaming
- **CSS3 Moderno**: Interface responsiva
- **JavaScript Vanilla**: Sem frameworks pesados

### Testes & Qualidade
- **Vitest**: Framework de testes moderno
- **V8 Coverage**: Análise de cobertura nativa
- **ESLint + Prettier**: Padronização de código
- **TypeScript Strict**: Verificações rigorosas

## Estado (LangGraph + LessonManager)

Fonte principal: `src/services/lessonManager.ts` (estado em memória) + nós em `src/graph/`.

Campos chave atuais:

- **todo[]**: backlog de tópicos e subtarefas derivado de seed estático (mock) ou inicialização automática.
- **currentTopicId / currentSubtaskId**: ponteiros de progresso.
- **lessons[]**: cada entrada representa uma seção finalizada (id, topicId, subtaskId, content, citations).
- **questionsQueue[]**: perguntas classificadas para PAUSE aguardando resposta/broadcast.
- **broadcastQueue[]**: blocos de respostas prontos para emitir quando há janela (ex: troca de subtask ou flush explícito).
- **inserts[]**: estrutura intermediária usada para empurrar blocos discretos via SSE (`insert` events) para PAUSE ou END_TOPIC.
- **answers[]**: histórico consolidado (usado para depuração / futuro UI).
- **route**: última rota de classificação aplicada.
- **done**: boolean sinalizando término de todos os tópicos processados.
- **isPaused**: indica se execução de geração está suspensa aguardando interação.
- **logs[]**: telemetria por nó (latência, ações).
- **sessionId / traceId**: correlação de execução.

Diferenças em relação ao design original: camadas de Curador e Verificador ainda não ativas; NOTE e IGNORE são planejados mas não geram inserts hoje (rotas ativas: `CHAT_NOW`, `PAUSE`, `END_TOPIC`).

## Fluxo de Dados

### Pipeline Principal

```
TODO Input → Ingest → Topic Selection → Lesson Draft → RAG Enhancement → Quality Check → Output
```

### Chat Processing (Subgraph)

```
Message → Judge → Route Decision → Process → Response/Queue → Broadcast
```

### Sistema de Ações de Perguntas (Estado Atual)

Implementadas e cobertas por testes:

1. **CHAT_NOW**: Resposta imediata (via nó `answerChatNow`) – hoje pode resultar em resposta curta derivada do pipeline base (stub simplificado).
2. **PAUSE**: Gera insert em `inserts[]` (modo `pause`) exibido via SSE; geração de lições continua suspensa até drenagem ou retomada.
3. **END_TOPIC**: Consolida respostas relativas ao tópico atual e gera insert de resumo (modo `end_topic`), avançando ponteiro de tópico.

Planejadas (infra parcialmente preparada):

1. **NOTE**: armazenar anotação out-of-band sem interromper fluxo.
2. **IGNORE**: descartar sem efeito lateral (apenas log).

Campos auxiliares já existentes (`questionsQueue`, `broadcastQueue`, `participants`, `answers`) suportam evolução futura para NOTE/IGNORE sem refactor profundo.

## Nós (Principais Ativos)

Localização: `src/graph/nodes/*`

| Nó | Função | Observações |
|----|--------|-------------|
| `pickNextTopic` / `pickNextSubtask` | Seleção de próximo trabalho | Mantém progresso linear simples |
| `draftLesson` | Cria draft base da seção | Texto base antes de grounding |
| `augmentLessonWithRAG` (groundWithRag) | (Stub) Enriquecimento + citações | Hoje retorna conteudo com placeholders e refs simuladas |
| `finalizeTopic` / `finalizeSection` | Marca seção como concluída | Empurra para `lessons[]` |
| `ingestMessage` / `judgeMessage` | Classificação de perguntas | Heurística + ragAgent.classifyQuestion |
| `answerChatNow` | Resposta imediata | Pode gerar insert futuro se expandido |
| `broadcastAnswers` | Emissão de fila de respostas | Chamada condicional; hoje mínimo |
| `processPauseAnswers` | Tratar respostas pausadas | Gera inserts modo `pause` |
| `processEndTopicAnswers` | Consolidar fim de tópico | Gera inserts modo `end_topic` |
| `verifyQuality` | Placeholder verificação | Ainda não implementa lógica real |

Cada nó loga evento `node_telemetry` com duração em ms.

## Decisões

- LangGraph escolhido pela flexibilidade de compor condicionalmente nós.
- Estado in-memory inicialmente para simplicidade (futuro: Redis / Postgres).
- RAG abstraído em agente para permitir troca de provider sem tocar nós centrais.

## Eventos SSE

Endpoint: `GET /course/stream`

Tipos emitidos (campo `type` sempre presente no payload JSON):

- **log**: abertura de stream ou mudanças funcionais (`initialized`, `stream_open`).
- **heartbeat**: a cada ~1s contendo `{ timestamp, isoTimestamp, paused }` para robustez em clientes.
- **lesson**: seção finalizada `{ id, topicId, subtaskId, idx, serverTs }`.
- **insert**: bloco de resposta especial `{ data: { id, mode: 'pause'|'end_topic', text, ts, isoTimestamp } }`.
- **done**: conclusão `{ total, final? }` (último evento garantido se não houver erro).
- **error**: falhas operacionais.

Estratégias de robustez:

1. Emissão imediata de `heartbeat` na conexão para detecção de prontidão.
2. Heartbeat periódico independente de produção de conteúdo.
3. Buffer de inserts em memória evita perda caso cliente fique momentaneamente ocupado.
4. Finalização dupla (`done` + loop break) garante término mesmo se estado `done` alcançado antes de flush de inserts.

## Override de Rotas para Testes

Endpoint `POST /chat/send` aceita campo opcional `forceRoute` (`PAUSE`|`END_TOPIC`) permitindo cenários determinísticos em E2E sem depender apenas de heurísticas de classificação. Uso documentado nos testes em `tests/e2e-server-harness.spec.ts`.

\n## Segurança
Validação de ENV com Zod. Sem segredos em logs.

\n## RAG
`retrieve` -> documentos candidatos; `ground` -> injeta citações em draft; `answerWithCitations` -> resposta focal citável.

## Pausas, Inserts & Broadcast

- Perguntas roteadas para PAUSE geram entrada em `inserts[]` via `pushAnswer` → SSE `insert`.
- Ao detectar mudança de tópico ou rota `END_TOPIC`, `flushEndTopicAnswers` consolida e gera insert resumo.
- Geração de lições pausa enquanto há `isPaused` verdadeiro; retomada ocorre após consumo lógico (futuro: endpoint explícito /resume).

## Divergências do Design Original

- Curador, Verificador completo, NOTE/IGNORE ainda não implementados.
- RAG está stubado (fonte fixa) — substituição planejada por índice vetorial real.
- Checkpointing persistente ainda não ativo (somente estado volátil).

Essas diferenças estão refletidas no Roadmap revisado.
