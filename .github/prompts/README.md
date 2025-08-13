# Prompt Files - Como Usar

## 🚀 Ativação
Digite `/prompt` no chat do Copilot para ver os prompts disponíveis.

## 📋 Prompts Disponíveis

### `/prompt novo-plano`
Cria um novo plano de ação estruturado
- Pergunta objetivo, restrições e critérios
- Gera plano em `/workspace-plans/active/`
- Atualiza índice de memória

### `/prompt comandos`
Mostra comandos rápidos para usar durante execução:
- Controle de fluxo (PARAR, APROVAR, DETALHAR)
- Ajustes de plano (PRIORIZAR, ADICIONAR, PULAR)
- Debug e análise (DEBUG, REVIEW, ANALISAR)
- Controle de commit (COMMIT, ESPERAR)

### `/prompt debug`
Inicia sessão de debugging estruturada:
- Análise sistemática de problemas
- Cria arquivo debug em `/workspace-debug/`
- Propor soluções testáveis
- Integra correção no plano ativo

### `/prompt review`
Executa code review estruturado:
- Análise de testes, segurança, performance
- Identifica code smells e violações
- Cria relatório em `/workspace-debug/`
- Propor refatorações priorizadas

### `/prompt ajustar-plano`
Modifica o plano ativo em tempo real:
- Mudar prioridades
- Adicionar/remover subtarefas
- Pausar/retomar execução
- Expandir/reduzir escopo

### `/prompt controle-commit`  
Gerencia aprovações de alterações críticas:
- Aprovar/negar commits
- Controlar criação de arquivos
- Definir condições para mudanças

## 💡 Dicas
- Use `/prompt` seguido do nome do arquivo (sem extensão)
- Combine com comandos rápidos para máxima eficiência
- Debug e review criam arquivos rastreáveis automaticamente
