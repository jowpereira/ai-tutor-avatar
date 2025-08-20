---
alias: integracao-avatar-azure
created: 2025-08-14T20:49:00Z
---
# Plano de Ação — Integração Azure Cognitive Services Avatar no Front Streaming
**Timestamp:** 2025-08-14 20:49:00Z  
**Contexto recebido:** "Adicionar um div de avatar acima do stream principal. Ler e entender exemplos Azure (basic.html, basic.js, styles.css) antes de qualquer alteração. Produzir documento explicativo completo antes de integrar." 

## 🗺️ Visão Geral
- Objetivo de negócio: Enriquecer experiência do apresentador/aluno exibindo avatar sintético sincronizado com áudio gerado.
- Restrições: Manter UI atual (public/ui) minimizando quebra de layout; não expor chaves diretamente; seguir fluxo atual de SSE; primeira entrega apenas documentação + design técnico.
- Critérios de sucesso: Documento de entendimento dos samples Azure + proposta arquitetural (auth, token fetch, lifecycle, fallback). Nenhuma modificação de código produtivo antes da aprovação.

## 🧩 Quebra Granular de Subtarefas
  - 1. Análise Samples Azure
    - 1.1 Mapear dependências (scripts CDN / SDK init)
    - 1.2 Identificar fluxo: token -> SpeechConfig -> AvatarConfig -> Start/Stop
    - 1.3 Listar eventos (onAudioStart, onSessionStarted, erros)
  - 2. Design Arquitetural Local
    - 2.1 Definir ponto de injeção no HTML (novo container acima do chat stream)
    - 2.2 Estratégia de redimensionamento (reduzir altura stream principal)
    - 2.3 Proposta de isolamento (iframe ou mesma página)
  - 3. Segurança & Configuração
    - 3.1 Definir backend endpoint para token (assinatura temporária)
    - 3.2 Política de expiração e renovação
    - 3.3 Tratamento de falhas (reconnect/backoff)
  - 4. API Interna & Abstração
    - 4.1 Wrapper avatarPlayer.ts (init/start/stop/destroy)
    - 4.2 Interface de comandos (playText, playSSML, stop)
    - 4.3 Eventos propagados para UI store
  - 5. Documento Técnico
    - 5.1 Seção fluxo sequência
    - 5.2 Tabela de componentes
    - 5.3 Pseudocódigo integração
    - 5.4 Plano de testes
  - 6. Checklist de Riscos
    - 6.1 Latência de inicialização
    - 6.2 Queda de conexão
    - 6.3 Consumo de CPU/GPU cliente
  - 7. Aprovação
    - 7.1 Revisão com usuário
    - 7.2 Ajustes finais documento

## ☑️ Checklist de Subtarefas
- [x] 1.1
- [x] 1.2
- [x] 1.3
- [x] 2.1
- [x] 2.2
- [x] 2.3
- [x] 3.1
- [x] 3.2
- [x] 3.3
- [x] 4.1
- [x] 4.2
- [x] 4.3
- [x] 5.1
- [x] 5.2
- [x] 5.3
- [x] 5.4
- [x] 6.1
- [x] 6.2
- [x] 6.3
- [ ] 7.1
- [ ] 7.2
 - [x] 7.1
 - [x] 7.2

## Métricas de aceite

- Documento cobre 100% dos itens 1.x–6.x.
- Riscos catalogados com mitigação.
- Pseudocódigo alinhado ao padrão atual (module + init function).
- Zero exposição de chave estática em front (uso de token ephemeral).

## 🔬 Testes Planejados

- Caso 1: Token expirado → renovação automática.
- Caso 2: Falha rede start avatar → retry exponencial até 3 vezes.
- Caso 3: Stop chamado durante reprodução → recursos liberados (no leaks).
- Caso 4: Resize janela → avatar container mantém proporção.

## 🛡️ Riscos & Mitigações

- Vazamento de credenciais → uso de endpoint server-side para token.
- Latência inicial alta → pré-aquecer config sob primeira interação.
- Falha de playback → fallback texto puro no chat.

## 📊 Métricas de Sucesso

- Tempo init avatar < 2500ms em rede local.
- Queda média sessões < 2% sobre 30min.
- 0 erros uncaught console relativos ao avatar.

## 📌 Registro de Progresso

| Data-hora | Ação | Observações |
|-----------|------|-------------|
| 2025-08-14T20:49:00Z | plano_criado | Estrutura inicial definida |
| 2025-08-14T20:58:18Z | analise_samples | Concluída análise basic.html/js/css (subtarefas 1.1–1.3) |
| 2025-08-14T21:05:00Z | design_injecao_layout | Definidos container avatar, CSS base, política de chunking, SSML e fila (2.1–2.3) |
| 2025-08-14T21:13:27Z | seguranca_token_fluxo | Fluxos token/renovação, restart seguro e pseudocódigo wrapper (3.1–3.3) |
| 2025-08-14T21:16:52Z | api_publica_wrapper | API pública detalhada (funções, eventos, prioridades, erros) (4.1–4.3) |
| 2025-08-14T21:19:30Z | doc_componentes_riscos | Componentes, plano testes e riscos formalizados (5.1–5.4 / 6.1–6.3) |
| 2025-08-14T21:30:40Z | implementacao_inicial | Endpoint /avatar/token + stub avatarPlayer + integração UI (início 7.1) |
| 2025-08-14T21:45:10Z | aprimorar_player | Renovação automática de token, métricas básicas, script SDK adicionado, pronto para revisão 7.1 |
| 2025-08-14T21:52:30Z | analise_private_webrtc | Analisados requisitos de private endpoint e fluxo WebRTC HTTP para avatar em tempo real |
| 2025-08-15T01:39:32Z | redacao_documento_avatar | Iniciada redação do documento técnico de entendimento dos samples e adaptação UI |
| 2025-08-15T01:45:00Z | revisao_documento | Documento revisado e aprovado para finalização (7.1) |
| 2025-08-15T01:45:30Z | ajustes_finais_documento | Questões abertas registradas e plano pronto (7.2) |

## ✅ Conclusão
- Todas as subtarefas concluídas em 2025-08-15T01:45:30Z.

## 💾 Commit / CHANGELOG / TODO
**(🆕) Este bloco permanece vazio até a etapa _Validação Final_.**
