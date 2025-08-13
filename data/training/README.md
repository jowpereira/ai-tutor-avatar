# Base de Treinamentos (Mock)

Esta pasta contém uma base mockada para demonstrar o funcionamento do sistema agentic com RAG.

## Estrutura

```
/data/training
  /todos       -> Lista de tarefas (currículo) em JSON
  /rag         -> Documentos de suporte por tópico
```

## Arquivos
- `todos/todos.json`: Lista principal com 10 tópicos de treinamento e subtarefas
- `rag/tx.json`: Cada arquivo contém documentos curtos relevantes ao tópico (3 docs cada)

## Tópicos Cobertos
1. Introdução a Machine Learning
2. Fundamentos de Redes Neurais
3. NLP Clássico
4. Transformers Essentials
5. Prompt Engineering
6. Avaliação de Modelos
7. Sistemas de Recomendação
8. MLOps Básico
9. RAG Pipeline
10. Fine-tuning & Adaptação

## Uso Futuro
- Ingestão inicial via `ingestTodo`
- Enriquecimento RAG futuro: substituir docs stub por embeddings reais
- Pode ser estendido com metadados (dificuldade, duração, prerequisitos)

## Próximos Passos Sugeridos
- Adicionar índice vetorial (por exemplo: local Faiss ou Chroma)
- Gerar embeddings para cada documento
- Mapear cada subtask a um subconjunto de documentos

---
*Mock pronto para demonstração end-to-end.*
