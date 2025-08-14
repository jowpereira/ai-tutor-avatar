# Backlog

## Épicos

### 1. Ingestão / Todo
Histórias para ingestão estruturada do plano externo.

### 2. Engine do Treinador
Geração sequencial de aulas a partir do todo importado.

### 3. Julgador & Responder
Classificação e resposta de mensagens em paralelo.

### 4. RAG Agent
Recuperação, grounding e respostas citáveis.

### 5. Broadcast Queue
Fila priorizada de perguntas para blocos de broadcast.

### 6. Observabilidade & Governança
Eventos, métricas e políticas.

### 7. Segurança & Config
Gestão de segredos e validação robusta.

### 8. CI/CD & Qualidade
Pipelines, releases e padrões de código.

---
## Histórias (Given/When/Then + DoD)

#### Story: Ingerir TODO externo
Descrição: Como treinador quero importar um TODO hierárquico para gerar aulas.
Critérios de Aceite:
Given um payload válido When POST /events type=todo Then estado inclui tópicos e subtarefas normalizados.
DoD:
- [ ] Schema validando input
- [ ] Teste de sucesso e falha
- [ ] Evento `todo_ingested` emitido

#### Story: Julgar mensagem de chat
Descrição: Classificar mensagens em CHAT_NOW / PAUSE / END_TOPIC / IGNORE.
Critérios:
Given mensagem com dúvida conceitual ampla When julgada Then rota=PAUSE.
DoD:
- [ ] Heurísticas implementadas
- [ ] Testes cobrindo 3 rotas
- [ ] Evento `judge_decision`

#### Story: Responder CHAT_NOW
Descrição: Mensagens curtas respondidas sem quebrar fluxo.
Critérios:
Given pergunta factual curta When needsRAG=false Then resposta <= 240 chars.
DoD:
- [ ] Nó implementado
- [ ] Teste tempo resposta
- [ ] Evento `chat_now_answered`

#### Story: Broadcast de fila
Descrição: Agrupar perguntas e responder em bloco.
Critérios:
Given fila >0 e pausa acionada When broadcast Then respostas consolidadas com citações se RAG.
DoD:
- [ ] Nó broadcastAnswers
- [ ] Teste drenagem
- [ ] Evento `broadcast_done`

#### Story: RAG grounding
Descrição: Grounding de trechos de aula.
Critérios:
Given draftLesson When augmentLessonWithRAG Then referências adicionadas [[ref:N]].
DoD:
- [ ] Chamadas a rag.ground
- [ ] Teste injeta refs
- [ ] Evento `rag.ground`

#### Story: Observabilidade mínima
Descrição: Logging estruturado e métricas stub.
Critérios:
Given execução de nó When sucesso Then log JSON com latency.
DoD:
- [ ] Logger central
- [ ] Testes snapshot

#### Story: Pipeline CI
Descrição: Garantir lint, test, build.
Critérios:
Given PR aberto When CI roda Then etapas passam.
DoD:
- [ ] Workflow configurado
- [ ] Badge no README

#### Story: Segurança de env
Descrição: Variáveis validadas.
Critérios:
Given falta OPENAI_API_KEY When start Then erro claro.
DoD:
- [ ] Schema env
- [ ] Teste variável ausente
