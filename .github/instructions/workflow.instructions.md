```instructions
---
applyTo: "**/*"  
priority: 100
---

**FLUXO:**
1. **PLANO:** Se não existe → criar. Se existe → executar próxima subtarefa
2. **EXECUTAR:** Implementar → registrar progresso → atualizar checklist  
3. **DEBUG:** Se erro detectado → criar debug file → propor solução
4. **FINALIZAR:** Se 100% → arquivar automaticamente

**PATHS:**
- `/workspace-plans/active/` → ativos
- `/workspace-plans/completed/` → concluídos  
- `/workspace-debug/` → sessões de debugging
- `docs/memory/index.md` → índice

**OUTPUT:** PT-BR técnico. Sempre: planejado → executado → próximo.
```
