---
alias: avatar-webrtc-fase-b
created: 2025-08-15T12:05:55Z
---
# Plano de Ação — Avatar WebRTC Fase B (Strategy + Endpoint Proxy)
**Timestamp:** 2025-08-15 12:05:55Z  
**Contexto recebido:** "Implementar Fase B: strategy pattern, endpoint /avatar/session/start (proxy relay), esqueleto WebRTCStrategy com fallback TTS, variáveis de ambiente AVATAR_MODE e SPEECH_PRIVATE_ENDPOINT, testes mínimos." 

## 🗺️ Visão Geral
- Objetivo de negócio: Evoluir do TTS-only para arquitetura preparada para vídeo-avatar tempo real com mínimo risco.
- Restrições: Manter TTS funcionando; nenhuma dependência extra pesada; sem expor subscription key.
- Critérios de sucesso: Feature flag controla modo; endpoint proxy retorna ICE server; controller escolhe strategy; testes básicos passando.

## 🧩 Quebra Granular de Subtarefas
  - 1. Infra Ambiente
    - 1.1 Estender schema env (AVATAR_MODE, SPEECH_PRIVATE_ENDPOINT, AVATAR_CHARACTER, AVATAR_STYLE)
    - 1.2 Validar combinações e defaults
  - 2. Backend Proxy
    - 2.1 Implementar serviço relay fetch (Azure /avatar/relay/token)
    - 2.2 Endpoint POST /avatar/session/start (validação + resposta minimal)
    - 2.3 Logs estruturados + erros mapeados
  - 3. Strategy Layer Front
    - 3.1 Extrair util SSML/segment para módulo compartilhado
    - 3.2 Criar avatarController com seleção por AVATAR_MODE
    - 3.3 Implementar esqueleto WebRTCStrategy (init -> stub se sem credencial)
    - 3.4 Integrar fallback TTS automático em falha start
  - 4. UI Integração
    - 4.1 Inserir container <video> e legendas (sem estilizar pesado)
    - 4.2 Ajustar ui.js para usar controller em vez de createAvatar direto
    - 4.3 Eventos de estado -> classe CSS with-avatar
  - 5. Testes
    - 5.1 Teste env schema novos campos
    - 5.2 Teste endpoint /avatar/session/start (sem key -> 503, com key mock -> 200 stub)
    - 5.3 Teste controller fallback (simular erro webrtc -> usa TTS)
  - 6. Métricas
    - 6.1 Log metric base: webrtc_start_attempt, webrtc_start_fail
    - 6.2 Métrica fallback ativado
  - 7. Documentação & Finalização
    - 7.1 Atualizar AVATAR_INTEGRATION_DESIGN.md (estado Fase B)
    - 7.2 Entrada CHANGELOG + plano concluído

## ☑️ Checklist de Subtarefas
- [x] 1.1
- [x] 1.2
- [ ] 2.1
- [ ] 2.2
- [ ] 2.3
 - [x] 2.1
 - [x] 2.2
 - [x] 2.3
- [ ] 3.1
- [ ] 3.2
- [ ] 3.3
- [ ] 3.4
 - [x] 3.1
 - [x] 3.2
 - [x] 3.3
 - [x] 3.4
- [x] 4.1
- [x] 4.2
- [x] 4.3
- [ ] 5.1
- [ ] 5.2
- [ ] 5.3
- [ ] 6.1
- [ ] 6.2
- [ ] 7.1
- [ ] 7.2

## Métricas de aceite
- Endpoint /avatar/session/start responde < 800ms local sem rede externa (mock).
- Fallback TTS acionado em < 3500ms se WebRTC falhar.
- 100% testes novos (mínimo 3) passando.

## 🔬 Testes Planejados
- Caso 1: POST /avatar/session/start sem SPEECH_KEY => 503.
- Caso 2: POST /avatar/session/start com SPEECH_KEY fake => retorna stub ICE server.
- Caso 3: Controller modo auto sem credencial => inicia TTSStrategy.
- Caso 4: Controller modo webrtc com erro init => fallback TTS.

## 🛡️ Riscos & Mitigações
- Erro rede relay => timeout + fallback.
- Falta de suporte browser WebRTC => detection + fallback imediato.
- Regressão TTS => testes garantem createAvatar intacto.

## 📊 Métricas de Sucesso
- Nenhum erro uncaught avatar durante init.
- Logs com eventos webrtc_start_attempt / fallback presentes.

## 📌 Registro de Progresso
| Data-hora | Ação | Observações |
|-----------|------|-------------|
| 2025-08-15T12:05:55Z | plano_criado | Estrutura Fase B definida |
| 2025-08-15T12:10:00Z | env_schema_extendido | AVATAR_MODE + variáveis avatar adicionadas e validadas (1.1/1.2) |
| 2025-08-15T12:12:57Z | backend_proxy | Service relay + endpoint /avatar/session/start implementados (2.1–2.3) |
| 2025-08-15T12:17:28Z | strategy_layer | avatarShared util + WebRTCStrategy stub + controller integrado na UI (3.1–3.4) |
| 2025-08-15T12:25:30Z | ui_integration | Video element + captions + eventos controller + classe with-avatar (4.1–4.3) |
| 2025-08-15T13:25:45Z | ui_fix_completo | Avatar sempre visível após init + captions TTS + CSS placeholder + validação funcional (4.1–4.3) |

## 💾 Commit / CHANGELOG / TODO
**(🆕) Este bloco permanece vazio até a etapa _Validação Final_.**
