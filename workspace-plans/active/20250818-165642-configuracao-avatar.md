# Plano de Ação — Documentar & Padronizar Configuração do Avatar
**Timestamp:** 2025-08-18 16:56:42  
**Contexto recebido:** "onde fica a configuração do avatar? já está integrado, preciso entender melhor"

## 🗺️ Visão Geral
- Objetivo de negócio: Permitir que qualquer desenvolvedor habilite, configure e depure o Avatar (WebRTC ou TTS fallback) rapidamente.
- Restrições: Manter comportamento atual (fallback automático), não quebrar streaming de lições, evitar dependência obrigatória de credenciais Azure em modo `tts` ou `auto` sem chave.
- Critérios de sucesso: (1) Documentação clara das variáveis e fluxos; (2) Teste simples valida mudança de modo; (3) Guia de troubleshooting; (4) Consistência entre backend (routes + env) e frontend (controller + strategies).

## 🧩 Quebra Granular de Subtarefas
  - 1. Levantamento
    - 1.1 Mapear pontos de configuração (env, endpoints, controller front, strategies)
    - 1.2 Listar variáveis e defaults + validações
  - 2. Documentação
    - 2.1 Criar seção dedicada em `README` ou doc separado (ex: `docs/AVATAR_CONFIG.md`)
    - 2.2 Incluir fluxograma: auto → (tenta webrtc) → fallback tts
    - 2.3 Adicionar tabela de variáveis + efeito prático
  - 3. Testes
    - 3.1 Teste modo forçado `AVATAR_MODE=tts`
    - 3.2 Teste modo forçado `AVATAR_MODE=webrtc` sem credenciais (erro esperado)
    - 3.3 Teste `AVATAR_MODE=auto` sem credenciais (fallback tts) e com credenciais (tentativa webrtc)
  - 4. Troubleshooting & Métricas
    - 4.1 Adicionar seção de erros comuns (`token_fetch_failed`, `avatar_unavailable`)
    - 4.2 Explicar logs emitidos (`avatar.token_issued`, `avatar.session_start_error`)
  - 5. Refinos de Código (opcional / se necessário)
    - 5.1 Expor `window.AVATAR_MODE` originado do backend (se não existir)
    - 5.2 Garantir métricas consistentes em TTS vs WebRTC (nomes uniformes)
  - 6. Validação Final
    - 6.1 Revisar consistência doc ↔ código
    - 6.2 Atualizar CHANGELOG se houver arquivo novo

## ☑️ Checklist de Subtarefas
- [ ] 1.1
- [ ] 1.2
- [ ] 2.1
- [ ] 2.2
- [ ] 2.3
- [ ] 3.1
- [ ] 3.2
- [ ] 3.3
- [ ] 4.1
- [ ] 4.2
- [ ] 5.1
- [ ] 5.2
- [ ] 6.1
- [ ] 6.2

## Métricas de aceite
- Mudar `AVATAR_MODE` e observar comportamento correto sem alterar código.
- Logs de fallback aparecendo quando esperado (`init_fail` + fallback TTS).
- Teste automatizado validando fallback (webrtc indisponível → tts).

## 🔬 Testes Planejados
- (3.1) Inicializar com `AVATAR_MODE=tts` e ausência de `SPEECH_KEY` → não requisita `/avatar/session/start`.
- (3.2) `AVATAR_MODE=webrtc` sem credenciais → backend retorna 503 e front não quebra (erro claro).
- (3.3) `AVATAR_MODE=auto` sem credenciais → tenta `/avatar/token` → 503 → cria TTS player.

## 🛡️ Riscos & Mitigações
- Uso incorreto de `AVATAR_MODE=webrtc` sem credenciais → validação já existente no schema (mitigado).
- Divergência doc/código → revisão cruzada (6.1).
- Excesso de logs ruidosos → manter namespace `avatar.` padronizado.

## 📊 Métricas de Sucesso
- 100% subtarefas concluídas.
- 1 novo documento de configuração criado.
- 3 cenários de modo validados manualmente ou via teste.

## 📌 Registro de Progresso
| Data-hora | Ação | Observações |
|-----------|------|-------------|
| 2025-08-18T16:56:42Z | plano_criado | Estrutura inicial definida |
| 2025-08-18T17:19:19Z | plano_cancelado | Arquivado sem execução das subtarefas a pedido do usuário |

## 💾 Commit / CHANGELOG / TODO
**(🆕) Este bloco permanece vazio até a etapa _Validação Final_.**
