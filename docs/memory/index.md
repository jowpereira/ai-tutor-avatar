# Sistema Agentic de Treinamento com LangChain + LangGraph

> 🤖 **IA que ensina de forma inteligente** - Um "professor-agente" que gera cursos sequenciais e responde dúvidas de forma contextual

---

## 🎯 **Conceito Central**

**Sistema de 6 agentes** que transforma um **TodoList importado** em **curso completo**, com **interrupção inteligente** para responder perguntas do chat quando fizer sentido.

### 🏗️ **Arquitetura Fundamental**

```
TodoList → Treinador → Aulas → Chat → Julgador → [Agora|Depois|Ignorar]
    ↓           ↓                    ↓
  Curador    Verificador           RAG/Citações
```

### 🤖 **Os 6 Agentes**

| Agente                   | Função                | Decisão-chave             |
| ------------------------ | ----------------------- | -------------------------- |
| **🎓 Treinador**   | Gera aulas sequenciais  | Onde inserir conteúdo RAG |
| **📝 Curador**     | Edita TodoList          | Como reorganizar trilha    |
| **⚖️ Julgador**  | Triagem de perguntas    | AGORA vs DEPOIS vs IGNORAR |
| **💬 Respondedor** | Responde chat/broadcast | Com ou sem RAG             |
| **📚 RAG**         | Busca + citações      | Quais fontes usar          |
| **✅ Verificador** | Controle de qualidade   | Aprovar ou revisar         |

### 🔄 **Fluxo de Decisão**

1. **Pergunta chega** → Julgador analisa contexto
2. **AGORA**: Resposta rápida no chat, aula continua
3. **DEPOIS**: Enfileira para broadcast na próxima pausa
4. **IGNORAR**: Fora de escopo, vai para FAQ/digest

### 🧠 **Inteligência RAG**

- **Automática**: Detecta quando precisa de fatos/citações
- **Transparente**: Sempre mostra as fontes usadas
- **Conflitos**: Apresenta versões divergentes honestamente
- **Cache**: Otimizado para respostas frequentes

---

## ⚡ **Diferenciais Técnicos**

### 🎭 **Metáfora: Maestro + Plateia**

- **Maestro** (Treinador) conduz a partitura (TodoList)
- **Plateia** (alunos) levanta a mão (chat)
- **Jurado** (Julgador) decide: sussurro, anúncio ou depois

### 🔧 **LangGraph + Checkpointing**

- **Estados persistentes**: Pausa/retoma exatamente onde parou
- **Grafo de decisões**: Fluxo adaptativo baseado no contexto
- **Auditoria completa**: Cada decisão é logada e explicada

### 📊 **Observabilidade Total**

- **Métricas**: Custo, latência, satisfação, qualidade
- **Logs estruturados**: Cada nó do grafo é monitorado
- **Alertas**: Qualidade baixa, custos altos, usuários insatisfeitos

---

## 🎯 **Casos de Uso**

### ✅ **Funciona bem para:**

- Cursos técnicos com base documental sólida
- Turmas que fazem perguntas durante explicações
- Conteúdo que precisa de fatos/citações atualizadas
- Necessidade de auditoria e compliance

### ⚠️ **Não é ideal para:**

- Conteúdo 100% criativo (sem base documental)
- Aulas que não toleram interrupções
- Orçamentos muito limitados para LLMs
- Contextos onde citações não importam

---

## 🚀 **Status e Próximas Fases**

### ✅ Fase 1 (Implementada): "TodoList → Aulas" (sem chat interativo ainda)

Escopo entregue no código atual:

- Treinador (geração sequencial de lições a partir do TodoList)
- RAG básico com citações inline `[[ref:N:docId]]`
- Persistência incremental das lições geradas (`data/training/generated-lessons.json`)
- Normalização simples de citações (dedupe por lição)
- Métricas & logs estruturados (pino + eventos)

Componentes planejados mas NÃO incluídos ainda nesta fase:

- Chat em tempo real (Respondedor) e fila de broadcast AGORA/DEPOIS completa
- Curador (reordenação inteligente do TodoList)
- Verificador de Qualidade (ciclo de revisão automatizado)
- Checkpointing avançado de estado fine‑grained (hoje persistimos snapshot simples)

### 🔜 Fase 2 (Próxima): Integração do Chat + Julgador Completo

Objetivos:

1. Julgador triando perguntas (AGORA / DEPOIS / IGNORAR)
2. Fila de broadcast e drenagem em momentos de pausa entre lições
3. Refinamento incremental de lições com feedback do chat
4. Anotações de qualidade preliminares (marcadores de revisão)

### 🛠️ Roadmap Resumido (Macro)

1. (Feito) Geração sequencial + RAG
2. (Em andamento) Camada de interação (chat + julgador)
3. Curadoria e reordenação dinâmica
4. Verificador + métricas de qualidade e custo
5. Checkpointing granular e reprocessamento seletivo

---

## 📖 **Documentação Técnica**

### 🧭 **Navegação Rápida**

- **🔧 Especificação completa**: [`design/sistema-agentic-treinamento.md`](../design/sistema-agentic-treinamento.md)  
- **📝 Plano executado**: [`workspace-plans/completed/sistema-agentic-treinamento-langchain.md`](../../workspace-plans/completed/sistema-agentic-treinamento-langchain.md)  
- **🧠 Memória (este arquivo)**: `docs/memory/index.md`

Nota: O link anterior para `docs/index.md` foi removido porque esse arquivo não existe no repositório.

### 🎯 **Referências Cruzadas (Ajustadas)**

- **Arquitetura → Implementação**: ver seção de LangGraph no design principal.
- **Prompts**: seção de Prompts & Templates no design.
- **RAG**: seção de Cenários de Uso (exemplos de consulta + citações).
- **Roadmap**: seção de Roadmap no design.

Observação: Âncoras exatas podem variar conforme ajustes futuros no arquivo de design; manter coerência sem quebrar build.

---

**🎯 Fase 1 concluída: geração de curso baseada em TodoList com RAG e persistência. Próxima entrega: chat/julgador.**

---

| Data | Tarefa | Status | Observações |
|------|--------|--------|-------------|
| 2025-08-13 | Ajustar Front + Fluxos Perguntas Chat/Curso | FUNDIDO | Fundido em 2025-08-14T01:50:00Z no plano Migração Front Remix |
| 2025-08-13 | Migração Front Remix | CONCLUÍDO | Site estático funcional em localhost:3001/ui |
| 2025-08-13 | Implementar 5 Ações Perguntas Avatar | CONCLUÍDO | ✅ Auto-processamento LLM + heurística funcionando! |
| 2025-08-14 | Classificador Chat: 5 Ações | CONCLUÍDO | Placeholder incremental END_TOPIC + flush correto |
| 2025-08-14 | Integração Azure Avatar | CONCLUÍDO | Documento de design aprovado (fase A) |
