# Documento de Entendimento e Design de Integração — Azure Talking Avatar

> Escopo: Consolidar entendimento dos samples `basic.html`, `basic.js`, `styles.css` (Azure Cognitive Services Speech Avatar WebRTC) e propor adaptação incremental sobre a UI atual (`public/ui/ui.html`) antes de qualquer alteração de código.

## 1. Resumo Executivo

Os samples demonstram inicialização de uma sessão de Avatar em tempo real via WebRTC usando o Speech SDK no browser. O fluxo central:

1. Usuário fornece Region + API Key (ou private endpoint).
2. Cria-se `SpeechConfig` (por subscription ou endpoint privado + key).
3. Requisição HTTP (GET) a `/avatar/relay/token/v1` para obter ICE server credentials (TURN/STUN) necessárias à sessão WebRTC.
4. Monta-se `AvatarConfig` (character, style, background, opções de crop/transparência, ICE servers remotos).
5. Instancia `AvatarSynthesizer` e chama `startAvatarAsync(peerConnection)` passando um `RTCPeerConnection` pré-configurado com transceivers para áudio e vídeo.
6. Recebe-se tracks (ontrack) e eventos (data channel) para legendas e status; manipula UI (play, transparência via canvas para remoção de chroma key verde, etc.).
7. Para falar: gera-se SSML e chama `speakSsmlAsync` no `AvatarSynthesizer`.
8. Encerramento: `stopSpeakingAsync()` ou `close()`.

Diferenças para nosso cenário atual (TTS áudio somente):

- Sample usa WebRTC (vídeo + áudio) em vez de síntese direta por `SpeechSynthesizer`.
- Necessidade de fluxo ICE/TURN e manutenção de `RTCPeerConnection`.
- Eventos de sessão (start, end, turn start, switch to idle) chegam via data channel.
- Opcional: transparência de fundo usando canvas + processamento de frames (potencial custo CPU/GPU).

## 2. Componentes do Sample e Responsabilidades

| Componente                     | Responsabilidade                                                                                     | Observações / Adaptação Local                                                                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| basic.html                     | Estrutura completa de UI de demonstração: config, controles, vídeo, logs                          | Vamos extrair apenas container de vídeo + legendas + controles mínimos (start/stop) e posicionar acima do stream atual.                          |
| basic.js                       | Lógica: setupWebRTC, startSession, speak, stopSpeaking, stopSession, manipulação de DOM e eventos | Será mapeado para um módulo `avatarWebRTC.ts` encapsulando estado e expondo API.                                                               |
| styles.css                     | Estilos genéricos do demo + responsividade + switches                                               | Reutilizaremos subset mínimo (layout do vídeo, legendas). Restante será convertido em classes namespaced `.avatar-...` para evitar conflitos. |
| Speech SDK (CDN)               | Fornece `SpeechSDK.*` (AvatarSynthesizer, SpeechConfig...)                                         | Já carregado via `<script>` em nossa UI (para TTS). Precisaremos condicional de modo WebRTC vs TTS.                                             |
| /avatar/relay/token/v1 (Azure) | Emite credenciais ICE                                                                                | Chamado diretamente nos samples; em produção iremos PROXY no backend para não expor key.                                                        |

## 3. Sequência de Inicialização (Sample) vs Proposta Local

### 3.1 Sample

1. Coleta region/key / endpoint privado.
2. `SpeechConfig.fromSubscription` ou `fromEndpoint(..., key)`.
3. XHR GET relay token → ICE server list.
4. Cria `AvatarConfig` + injeta ICE servers.
5. Instancia `AvatarSynthesizer`.
6. Cria `RTCPeerConnection` (config com iceServers) → addTransceiver(video/audio).
7. `avatarSynthesizer.startAvatarAsync(peerConnection)`.
8. ontrack → montar `<video>`/`<audio>`, controlar autoplay/mute.
9. Falar via `speakSsmlAsync`.

### 3.2 Adaptação Local (Fase 1 WebRTC)

1. UI carrega (já temos `avatarShell`). Adicionaremos sub-div `avatarVideo` (já existe) contendo `<div class="avatar-video-container"><video id="avatarVideoEl"></video><div class="avatar-subtitles"></div></div>`.
2. Backend fornecerá endpoint `/avatar/session/start` (POST) → backend chama Azure relay token endpoint com subscription key (servidor) e retorna payload reduzido: `{ iceServer, characterCfgWhitelist }`.
3. Front solicita start apenas quando: (a) usuário clicar botão narrador ou (b) heurística auto-start primeira lesson.
4. Front monta `RTCPeerConnection` com ICE server retornado e prepara event handlers.
5. Chama `createAvatarWebRTC({ tokenProxy, character, style, background, voice })` que: cria `SpeechConfig` (Authorization token obtido de `/avatar/token` existente), cria `AvatarConfig`, injeta remoteIceServers, instância `AvatarSynthesizer`, chama `startAvatarAsync`.
6. ontrack: atribui stream ao `<video>`; controla mute/playsInline.
7. Data channel events → atualiza legendas (`avatarCaptions`).
8. Fala: converter nossa fila textual já existente (lessons, inserts, answers longos) para chamadas `speakSsmlAsync` sequenciais.
9. Encerramento: `stopSession()` no destroy global (ex: unload página ou botão). Fallback automático para modo TTS se falhar handshake WebRTC em < 3s.

## 4. Diferenças Técnicas e Impactos

| Aspecto           | TTS Atual                        | WebRTC Avatar                         | Impacto UI                                     | Impacto Backend                         |
| ----------------- | -------------------------------- | ------------------------------------- | ---------------------------------------------- | --------------------------------------- |
| Modalidade Mídia | Áudio sintetizado por HTTP pull | Áudio+Vídeo via PeerConnection      | Adicionar `<video>` escalonado               | Proxy token relay + config modo         |
| Tokenização     | Authorization token (9m)         | Authorization token + relay token ICE | Reuso renovação; extra chamada start sessão | Novo endpoint `/avatar/session/start` |
| Latência Start   | ~500-900ms primeira síntese     | 1.5–3s (config+ICE+offer/answer)     | Indicador loading avatar                       | Preparar prefetch on user intent        |
| Falhas Rede       | Fala isolada falha -> próxima   | Conexão drop -> reconstruir PC       | Exibir estado reconectando                     | Re-disparar relay fetch                 |
| Legendas          | Não implementado                | Via datachannel (TURN events)         | Precisar overlay em container                  | Nenhum                                  |
| Muting            | Para fila de síntese            | Muta track de áudio                  | Botão atual permanece                         | Nenhum                                  |

## 5. Segurança & Proxy

- Não expor `Ocp-Apim-Subscription-Key` no browser; backend executa chamadas relay token & (se private endpoint) utilizar host custom.
- Authorization token já implementado via `/avatar/token`. Reutilizar.
- Rate limiting: limitar start de sessão por IP / origin.
- Sanitização de parâmetros (character/style): whitelist backend.

## 6. Estrutura de Código Proposta

```
public/ui/
  avatarPlayer.js          # Permanece (modo TTS fallback)
  avatarWebRTC.js          # Novo: estratégia WebRTC
src/server/
  routes.ts                # + POST /avatar/session/start
  services/avatarSession.ts# Chamada a Azure relay token + validação env
```

### 6.1 Strategy Pattern

```
interface IAvatarStrategy {
  init(): Promise<void>
  speakText(id: string, text: string): Promise<void>
  stopSpeaking(): Promise<void>
  destroy(): Promise<void>
  isReady(): boolean
}
```

- `TTSStrategy` (wrapper atual de AvatarPlayer)
- `WebRTCStrategy` (usa AvatarSynthesizer + PeerConnection)
- Orquestrador: `avatarController` decide modo (`env: AVATAR_MODE=webrtc|tts|auto`).

## 7. Fluxo de Fila (Reutilização)

Fila já existente em `AvatarPlayer`: replicar lógica de segmentação e controle de mínimo de caracteres; para WebRTC apenas troca a execução de `speakSsmlAsync` no sintetizador WebRTC (mesma assinatura) — portanto podemos extrair função util `buildSSML(text, voice)` para shared.

## 8. Pseudocódigo WebRTCStrategy (Simplificado)

```js
class WebRTCStrategy {
  constructor(opts){ /* voice, character, style, fetchAuthToken, startSession */ }
  async init(){
    const auth = await opts.fetchAuthToken();
    this.speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(auth.token, auth.region);
    const session = await opts.startSession(); // { iceServer, character, style, background }
    const videoFormat = new SpeechSDK.AvatarVideoFormat(); // usar default inicialmente
    const cfg = new SpeechSDK.AvatarConfig(session.character, session.style, videoFormat);
    cfg.remoteIceServers = [ session.iceServer ];
    this.peer = new RTCPeerConnection({ iceServers: [ session.iceServer ] });
    this.peer.addTransceiver('video', { direction: 'sendrecv' });
    this.peer.addTransceiver('audio', { direction: 'sendrecv' });
    this.synth = new SpeechSDK.AvatarSynthesizer(this.speechConfig, cfg);
    await this.synth.startAvatarAsync(this.peer);
    this.ready = true;
  }
  async speakText(id, text){ const ssml = buildSSML(text, this.voice); await this.synth.speakSsmlAsync(ssml); }
  async stopSpeaking(){ await this.synth.stopSpeakingAsync(); }
  async destroy(){ try { this.synth.close(); } catch{} this.peer?.close(); }
  isReady(){ return !!this.ready; }
}
```

## 9. Layout & CSS Adaptação

### 9.1 Elementos Existentes

`<div id="avatarShell" class="avatar-shell">` já presente. Expandiremos:

```
.avatar-shell { display:flex; flex-direction:column; gap:4px; }
.avatar-video-container { position:relative; width:100%; max-width:480px; aspect-ratio:16/9; background:#222; border:1px solid #333; border-radius:6px; overflow:hidden; }
.avatar-video-container video { width:100%; height:100%; object-fit:cover; }
.avatar-subtitles { position:absolute; left:0; right:0; bottom:4%; text-align:center; color:#fff; text-shadow:0 0 4px #000; font-size:0.9rem; padding:0 8px; }
```

### 9.2 Redução do Stream Principal

- Atual: `#stream` abaixo. Estratégia: aplicar classe `with-avatar` em container pai quando avatar ativo.
- CSS:

```
.container.with-avatar #layout { display:flex; }
.container.with-avatar #content { flex:1; }
.container.with-avatar #stream { max-height: 55vh; overflow:auto; }
```

## 10. Estados e Indicadores

| Estado       | Descrição               | UI Feedback                                                     |
| ------------ | ------------------------- | --------------------------------------------------------------- |
| idle         | Sem sessão avatar ativa  | Botão iniciar visível, vídeo oculto/placeholder              |
| starting     | Solicitando sessão + ICE | Spinner sobre vídeo container                                  |
| ready        | Sessão estabelecida      | Vídeo exibido, botão speak talvez escondido (uso automático) |
| speaking     | Execução de SSML atual  | Animação leve (pulse borda)                                   |
| reconnecting | Tentativa de restabelecer | Banner amarelo temporário                                      |
| error        | Falha fatal               | Ícone vermelho + opção fallback para TTS                     |

## 11. Falhas & Fallback

| Falha               | Detecção                          | Ação                                                                       |
| ------------------- | ----------------------------------- | ---------------------------------------------------------------------------- |
| Timeout start (>3s) | Promise race                        | Cancelar, destruir peer, fallback TTS, log métrica `webrtc_start_timeout` |
| ICE failed          | `iceconnectionstatechange=failed` | Recriar sessão (máx 2) senão fallback                                     |
| speak erro isolado  | Rejeição `speakSsmlAsync`       | Retry 1x, depois prosseguir fila                                             |
| Token expiração   | Já coberto em TTS (renovação)    | Reutilizar renovação para auth token (não confundir relay)                |

## 12. Métricas Novas Propostas

- `webrtc_start_ms` (tempo do init até estado connected)
- `webrtc_reconnect_count`
- `avatar_subtitles_events` (contagem de turn start)
- `avatar_fallback_triggered` (motivo)
- `avatar_video_frame_drop` (futuro, se instrumentar)

## 13. Plano de Testes Incrementais

| Caso                  | Tipo         | Descrição                         | Resultado Esperado               |
| --------------------- | ------------ | ----------------------------------- | -------------------------------- |
| Start Sessão Sucesso | Integração | Chama start e recebe ontrack vídeo | Estado ready + métrica start_ms |
| Timeout Start         | Integração | Simular network delay>3s            | Fallback TTS ativado             |
| ICE Fail              | Simulado     | Forçar iceConnectionState=failed   | Recria 2x, depois fallback       |
| Speak Fila            | Unidade      | Enfileirar 3 segmentos              | Ordem preservada                 |
| Stop Session          | Integração | stopSession()                       | Tracks fechadas, estado idle     |

## 14. Roadmap Fases

| Fase | Conteúdo                                                                           | Saída                                  |
| ---- | ----------------------------------------------------------------------------------- | --------------------------------------- |
| A    | Documento (este)                                                                    | Aprovado pelo usuário                  |
| B    | Implementar strategy + endpoint session start (sem vídeo real se falta credencial) | Código atrás feature flag             |
| C    | Integrar WebRTC real + métricas + fallback                                         | Avatar em produção controlado por env |
| D    | Transparência / Crop / Subtitles refinadas                                         | Qualidade visual                        |

## 15. Variáveis de Ambiente Planejadas

| Nome                    | Exemplo                            | Uso                                            |
| ----------------------- | ---------------------------------- | ---------------------------------------------- |
| AVATAR_MODE             | auto                               | Seleciona strategy (webrtc/tts/auto)           |
| SPEECH_PRIVATE_ENDPOINT | mypriv.cognitiveservices.azure.com | Construção de URL wss endpoint (se definido) |
| AVATAR_CHARACTER        | lisa                               | Default character                              |
| AVATAR_STYLE            | casual-sitting                     | Default style                                  |
| AVATAR_BG_COLOR         | #FFFFFFFF                          | Cor de fundo                                   |

## 16. Decisões Tomadas

- Usar strategy pattern para manter TTS robusto em paralelo.
- Proxy para relay token no backend; NUNCA expor subscription key no browser.
- Fallback agressivo em 3s para evitar travar experiência textual.
- Reaproveitar token authorization flow existente para não duplicar lógica.

## 17. Itens em Aberto / Perguntas

| Tópico                    | Questão                 | Opções                                           |
| -------------------------- | ------------------------ | -------------------------------------------------- |
| Subtitles Persistência    | Guardar histórico?      | a) Apenas live (descartar), b) Buffer último turn |
| Consumo CPU Transparência | Ativar por padrão?      | a) Off inicial, toggle futuro                      |
| Métricas Backend          | Envio de client metrics? | a) Console apenas, b) POST /metrics                |

## 18. Próximos Passos (após aprovação)

1. Criar endpoint `/avatar/session/start` (proxy relay).
2. Implementar `avatarWebRTC.js` com API mínima (`init()`, `enqueueText()` reutilizando fila util compartilhada).
3. Refatorar `avatarPlayer.js` isolando util de segmentação/SSML para shared.
4. Feature flag `AVATAR_MODE` com fallback.
5. Testes unitários (fila shared) + integração mock (simular peer).

---

Fim do Documento.
