# Propostas (-alterar)

Este diretório descreve arquivos de evolução criados com sufixo `-alterar` sem impactar o código em produção atual.

## Objetivos
1. Persistência de lições geradas.
2. Refinamento manual de seções via prompt adicional.
3. Deduplicação e normalização de citações RAG.
4. API dedicada para fluxo de curso.

## Arquivos
- `lessonManager-alterar.ts`: versão estendida do gerenciador de lições.
- `ragAgent-alterar.ts`: utilidades de RAG com limiar e dedup de citações.
- `courseRoutes-alterar.ts`: esboço de rotas REST para curso.

Nenhum destes arquivos é carregado no servidor ainda.

## Próximos Passos
- Validar necessidade de cada feature.
- Integrar incrementalmente escolhendo um arquivo por vez.
- Remover duplicação somente após validação em ambiente de teste.

---
*Documento de proposta – não executar em produção sem revisão.*
