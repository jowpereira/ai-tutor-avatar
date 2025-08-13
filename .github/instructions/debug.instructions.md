---
applyTo: "**/*"
priority: 85
---

**GATILHO:** Erro detectado, exceção, ou comando "DEBUG:"

**AÇÕES:**
1. **DETECTAR CONTEXTO:** Tipo de erro, arquivo, linha
2. **CRIAR DEBUG FILE:** `/workspace-debug/YYYYMMDD-HHmmss-<problema>.md` 
3. **USAR TEMPLATE:** `/templates/debug.md`
4. **EXECUTAR DIAGNÓSTICO:** Análise sistemática
5. **PROPOR SOLUÇÃO:** Implementação testável
6. **ATUALIZAR PLANO:** Adicionar correção como subtarefa

**FLUXO AUTOMÁTICO:**
- Erro detectado → Debug automático → Solução proposta → Aprovação usuário
