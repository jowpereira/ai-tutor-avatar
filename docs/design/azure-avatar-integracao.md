# Integração Azure Cognitive Services Avatar — Documento de Entendimento Inicial

## 1. Objetivo
Fornecer análise detalhada dos samples Azure (basic.html, basic.js, styles.css) para embasar integração de um avatar visual + síntese de fala no topo da UI de streaming atual.

## 2. Sumário dos Samples Azure (basic.html / basic.js / styles.css)
### 2.1 Estrutura HTML Essencial
- Inclusões:
  - `<script src="https://aka.ms/csspeech/jsbrowserpackageraw"></script>` carrega Speech SDK (bundle bruto).
  - `<script src="./js/basic.js"></script>` lógica de demo.
- Áreas principais:
  - `#configuration` (entrada de region, API key, voice, avatar params, checkboxes: private endpoint, transparentBackground, videoCrop, subtitles, custom avatar options)
  - Painel de controle: botões `startSession`, `speak`, `stopSpeaking`, `stopSession` e textarea `spokenText`.
  - Container de vídeo: `#videoContainer` com `#remoteVideo` (inserção dinâmica de `<video>` e `<audio>`), canvases (`#canvas` e `#tmpCanvas`) para processamento de transparência (chroma green) e `#subtitles` overlay.
  - Área de logs: `#logging`.

### 2.2 Inicialização & Objetos Criados
- Após clique em `startSession`:
  1. Coleta region + API key (& private endpoint se habilitado).
  2. Cria `SpeechConfig` via `SpeechSDK.SpeechConfig.fromSubscription(...)` ou `fromEndpoint` (se private endpoint, inclui query `enableTalkingAvatar=true`).
  3. Configura `speechSynthesisConfig.endpointId` se custom voice.
  4. Constrói `AvatarVideoFormat` + crop opcional + resolution (padrão 1920x1080 com recorte condicional).
  5. Constrói `AvatarConfig(character, style, videoFormat)` e seta flags: `customized`, `useBuiltInVoice`, `backgroundColor`, `backgroundImage`.
  6. Requisita token relay (XHR GET) em endpoint avatar/relay/token/v1 com header `Ocp-Apim-Subscription-Key` (retorna ICE server info: Urls[0], Username, Password).
  7. Seta `avatarConfig.remoteIceServers` com STUN/TURN server recebido.
  8. Instancia `new SpeechSDK.AvatarSynthesizer(speechSynthesisConfig, avatarConfig)`.
  9. Define handler `avatarSynthesizer.avatarEventReceived` para logging de eventos (TURN_START, SESSION_END, SWITCH_TO_IDLE, etc.).
  10. Chama `setupWebRTC(...)` que:
      - Cria `RTCPeerConnection` com iceServers (com opção TCP se marcado) e adiciona transceivers `video` e `audio`.
      - Define `ontrack` para injetar `<video>` / `<audio>` dinâmicos, aplicar autoplay, set `playsInline`, iniciar loop de transparência se solicitado.
      - Cria dataChannel dummy para garantir recepção de eventos e escuta `datachannel` para eventos de sessão (gerencia exibição de legendas e estado UI).
      - Observa `oniceconnectionstatechange` para atualizar botões e fluxo (habilita speak/stopSession quando connected, reseta em disconnected/failed).
      - Invoca `avatarSynthesizer.startAvatarAsync(peerConnection)` para iniciar sessão.

### 2.3 Reprodução de Fala
- Botão `speak` monta SSML completo usando voice selecionada e `spokenText` → chama `avatarSynthesizer.speakSsmlAsync(spokenSsml)`.
- Em sucesso: reabilita `speak`, desabilita `stopSpeaking` e loga; em erro: verifica `CancellationDetails`.
- Botão `stopSpeaking` executa `avatarSynthesizer.stopSpeakingAsync()` para interromper a fala atual.
- Botão `stopSession` chama `avatarSynthesizer.close()` e desabilita controles.

### 2.4 Transparência de Fundo (Chroma Key)
- Loop `makeBackgroundTransparent`: copia frames do `<video>` para `#tmpCanvas`, examina pixels verdes (condições sobre canal G) e ajusta alpha para criar fundo transparente; redesenha em `#canvas` (30 FPS throttle). Empacota heurística simples para remoção de verde.

### 2.5 Eventos e Data Channel
- Data channel JSON event -> exibe legendas quando `EVENT_TYPE_TURN_START` e oculta em `EVENT_TYPE_SESSION_END` / `SWITCH_TO_IDLE`.
- `avatarEventReceived` fornece `description` e `offset`; usado apenas para logs.

### 2.6 Tratamento de Erros
- Falha `startAvatarAsync`: checa `ResultReason` e se `Canceled` extrai `CancellationDetails.errorDetails` exibindo via `log`.
- Falha em speak: idem.
- Erros WebRTC (iceConnectionState failed) levam a desabilitar botões e reexibir configuração.

### 2.7 Estilos Relevantes (styles.css)
- Layout responsivo; container vídeo com proporção (altura = largura * 0.75) e breakpoints para mobile.
- `.hidden` class simples.
- Botões com cor principal #d84a38.
- Canvas full width e ajuste de width para vídeo dinamicamente.
- Media queries alteram tamanhos de fontes e dimensões de player.

### 2.8 Dependências & Padrões
- Única dependência externa: bundle Speech SDK.
- Uso intensivo de DOM ID (imperativo) e variáveis globais.
- Sem build step; scripts inline referenciados diretamente.

### 2.9 Pontos Críticos para Produção
- Exposição direta de API key no front — não aceitável em nosso contexto → substituiremo por token ephemeral servidor.
- Uso de XHR síncrono-style (callback) — podemos migrar para fetch/async.
- Gestão manual de UI state — adaptaremos para nossa store central.

## 3. Fluxo de Execução (Draft)
1. Obter token de fala e região via backend seguro
2. Instanciar SpeechSDK com token → SpeechConfig
3. Configurar AvatarConfig (personagem, pose, estilo)
4. Criar player / synthesizer
5. Enfileirar texto/SSML (cada resposta ou bloco de lição)
6. Monitorar callbacks (onAudioStart, onVisemeReceived, onSessionStopped)
7. Gerenciar fila/concat de fala enquanto SSE entrega conteúdo
8. Destroy ao finalizar sessão ou ao trocar de curso

## 4. Mapeamento para Nossa Arquitetura
| Componente Azure | Equivalente / Integração Local | Observações |
|------------------|--------------------------------|------------|
| Token fetch | Novo endpoint /avatar/token | Retorna token ephemeral + region |
| SpeechConfig | Module avatarPlayer | Guardar instância singleton controlada |
| AvatarConfig | Config local (env + feature flag) | Personalização futura (persona) |
| Synthesizer / Player | avatarPlayer.playText | Encapsular erros / retries |
| Eventos (viseme, start) | Store UI (ex: avatarState) | Para animações futuras (fase 2) |

## 4.1 API Pública de Integração (Detalhada)
### 4.1.1 Funções Exportadas
| Função | Parâmetros | Retorno | Erros | Observações |
|--------|------------|---------|-------|-------------|
| `initAvatar(opts)` | `{ fetchToken, voice?, character?, style?, transparency? }` | `Promise<void>` | Token inválido, WebRTC fail | Idempotente; ignora chamadas subsequentes se já inicializado |
| `enqueueLesson(lesson)` | `{ id, content }` | `void` | NotReadyError | Quebra e enfileira chunks da lição |
| `enqueueInsert(insert)` | `{ id, type, text }` | `void` | NotReadyError | Usa regras de prioridade (end_topic, final_session) |
| `pauseNarration()` | — | `void` | - | Seta flag `paused`; não drena fila |
| `resumeNarration()` | — | `void` | - | Reinicia processamento se fila >0 |
| `stopAvatar()` | — | `Promise<void>` | - | Limpa fila e encerra sessão (soft) |
| `destroyAvatar()` | — | `void` | - | Hard close (para unload página) |

### 4.1.2 Eventos Emitidos
| Evento | Payload | Uso UI |
|--------|---------|--------|
| `ready` | `{}` | Mostrar container avatar |
| `queueSize` | `{ size }` | Badge fila |
| `playing` | `{ chunkId }` | Ativar indicador fala |
| `chunkComplete` | `{ chunkId, durationMs }` | Métrica latência chunk |
| `error` | `{ code, message }` | Banner erro / fallback |
| `sessionRestart` | `{ reason }` | Log debug |
| `tokenRenew` | `{ renewInMs }` | Observabilidade |

### 4.1.3 Prioridades Internas
Fila implementada como duas estruturas:
1. `highQueue` (inserts final_session, end_topic consolidado)
2. `normalQueue` (lições, respostas longas elegíveis)
Algoritmo `maybePlayNext`: drena sempre `highQueue` antes de `normalQueue`.

### 4.1.4 Debounce de Lição
Se duas lições chegam em < 800ms, adiar enfileirar da segunda até terminar chunk inicial para garantir ordem intuitiva sem intercalar narrativas.

### 4.1.5 Normalização Texto → Chunks
Pipeline: `raw` → remover citações/rodapés → colapsar espaços → split por \n duplo → para cada bloco > 450 chars, dividir por sentença preservando pontuação.

### 4.1.6 Estratégia de Cancelamento Suave
`pauseNarration`: apenas congela `maybePlayNext` (flag). `stopAvatar`: chama `stopSpeakingAsync` e esvazia fila mantendo sessão (para retomar rápido). `destroyAvatar`: fecha sessão e limpa timers.

### 4.1.7 Códigos de Erro Padrão
| Código | Descrição | Ação Sugerida |
|--------|-----------|---------------|
| `NotReadyError` | init não concluído | Esperar evento ready |
| `TokenRenewFailed` | 3 falhas sequência renovar | Mostrar opção retry manual |
| `SessionRestartFailed` | restart após falha ICE também falhou | Desativar avatar permanentemente |
| `SpeakChunkFailed` | chunk excedeu retries | Log + continuar |

### 4.1.8 Hooks de Extensão (Futuro)
- `onTransformRawLesson(text)`: permitir ajuste dinâmico (por ex. simplificação de linguagem).
- `shouldNarrateAnswer(answer)`: política custom para respostas.

### 4.1.9 Diagrama Simplificado
```
enqueueLesson → normalize → chunk → normalQueue → maybePlayNext → speakSsmlAsync
                                                           ↑
enqueueInsert (end_topic/final) → normalize → chunk → highQueue ┘
```

### 4.1.10 Limites Configuráveis
| Param | Default | Motivo |
|-------|---------|--------|
| `MAX_CHUNK_CHARS` | 450 | Latência e naturalidade |
| `MAX_QUEUE_SIZE` | 200 chunks | Proteger memória |
| `RENEW_MARGIN_MS` | 60000 | Janela segura token |
| `RESTART_MAX` | 1 | Evitar loops restart |
| `SPEAK_RETRIES` | 2 | Balancear robustez/tempo |

## 5. Design Proposto do Módulo (Preview)
API mínima:
```
initAvatar({ fetchToken }): Promise<void>
playText(text: string, opts?: { ssml?: boolean }): Promise<void>
stop(): Promise<void>
destroy(): void
on(event: 'ready'|'error'|'playing'|'stopped', handler)
```
Estado derivado armazenado em: `window.appState.avatar` (ou store isolada) contendo:
```
{
  ready: boolean,
  playing: boolean,
  lastError?: string,
  queue: Array<{ id: string, text: string }>
}
```

### 5.1 Responsabilidades
- Encapsular SDK (evitar globals), gerenciar sessão WebRTC + synthesizer.
- Gerir fila FIFO de enunciados (lições, inserts especiais) com coalescing.
- Converter texto bruto em SSML enriquecido (pausas, ênfase, linguagem PT-BR).
- Renovar token e reinicializar sessão transparente.
- Expor eventos para UI (ready, playing, queueSize, error) e para telemetria.

#### 5.1.1 Componentes & Responsabilidades (Tabela)

| Componente | Tipo | Função | Entradas | Saídas | Erros Notáveis |
|------------|------|-------|----------|--------|----------------|
| AvatarPlayer | Classe | Orquestra fila + sessão + playback | Texto normalizado, inserts | Eventos / métricas | SESSION_EXPIRED, SPEAK_CHUNK_FAILED |
| SessionManager | Interno | Criar / renovar sessão | Token | PeerConnection ativa | TOKEN_RENEW_FAILED |
| QueueManager | Interno | Dual queue prioridade (high/normal) | Items chunk | Próximo chunk | QUEUE_OVERFLOW |
| Chunker | Função pura | Divide texto conforme limites | Texto | Lista chunks | CHUNK_POLICY_VIOLATION |
| SSMLBuilder | Função pura | Gera SSML final (voz, pausas) | Chunk | SSML string | SSML_TEMPLATE_ERROR |
| RetryPolicy | Utilitário | Decide retry/backoff | Erro + tentativas | Delay ou abort | - |
| FallbackOrchestrator | Utilitário | Escalonar avatar→TTS→silencioso | Erro crítico | Novo modo | FALLBACK_LOOP |
| MetricsEmitter | Utilitário | Registrar spans/contadores | Eventos internos | Logs/metrics | METRICS_EXPORT_FAIL |
| UIAdapter | Interno | Atualizar DOM / estados | Eventos | Alterações DOM | UI_RENDER_ERROR |
| SecurityGateway | Backend | Fornecer token efêmero | Credenciais Azure | {token,expiresAt} | TOKEN_ENDPOINT_FAIL |

### 5.2 Regras de Entrada (O que o avatar lê)

Prioridade de enfileiramento:

1. Blocos de lição (lesson.content) já normalizados pelo pipeline atual.
2. Inserts finais (end_topic consolidado, final_session) — com prefixo verbal sintetizado ex: "Resumo de perguntas do tópico".
3. Respostas chat_now LONGAS (opcional flag) — somente se > N caracteres e não interromper lição em curso (buffer pós-lição).
4. Pausas (mode=pause) não são narradas; apenas lições retomadas.

### 5.3 Política de Chunking

- Tamanho alvo de cada chunk narrado: 300–450 caracteres ou ~6–8 segundos.
- Quebrar por parágrafo; se parágrafo > 450 chars, quebrar em frases mantendo pontuação.
- Pausa SSML entre chunks: `<break time='400ms'/>`.

### 5.4 Geração de SSML (Português)

Template base:

```xml
<speak version='1.0' xml:lang='pt-BR'>
  <voice name='{VOICE_PT}'>
    <mstts:express-as style='formal'>
      {CONTENT}
    </mstts:express-as>
  </voice>
</speak>
```

Transformações:

- Substituir códigos de citação [[ref:...]] (já removidos upstream) por pausa curta.
- Em listas detectadas (linhas iniciando com - ou *), inserir `<break strength='medium'/>` antes de cada item.
- Enfatizar títulos (linha isolada com <= 8 palavras e sem ponto) com `<emphasis level='strong'>`.

### 5.5 Cancelamento / Interrupção

- Se nova lição chega enquanto avatar ainda fala chunk anterior: não interromper; fila acumula.
- Se usuário clica "Parar" (futuro botão locutor): chamar `stop()` que cancela fala atual e limpa fila restante.
- Se sessão finaliza (done SSE): drenar fila, depois `destroy()`.

### 5.6 Manutenção de Sessão

- Sessão WebRTC/Avatar mantida viva enquanto houver geração (heartbeat a cada 60s opcional via speak de silêncio `<break time='1s'/>`).
- Recriação somente se erro terminal (iceConnectionState failed ou token invalidação repetida 2x).

### 5.7 Subtítulos & Acessibilidade

- Ativar `showSubtitles` interno, porém substituir overlay próprio pela nossa `<div id='avatar-captions'>` com ARIA `role='status'`.
- Gerar transcript incremental: acumular texto enviado (não o real viseme) para histórico exportável.

### 5.8 Métricas Internas Expostas

| Métrica | Descrição | Tipo |
|---------|-----------|------|
| avatar_queue_length | Itens aguardando síntese | gauge |
| avatar_speak_latency_ms | Tempo speakSsmlAsync resolve | histogram |
| avatar_session_restarts | Contagem de reinícios sessão | counter |
| avatar_token_renews | Renovação de token efetuada | counter |

## 6. Sequência de Interações (ASCII)

```text
[SSE Lesson/Answer Arrives] -> [enqueue text chunk] -> [if !playing start playText()] -> [SpeechSDK synthesizes] -> [Avatar renders frames] -> [on complete -> dequeue -> next]
```

## 7. Considerações de Layout

- Novo container #avatar-container acima do atual chat.
- Reduzir altura do stream principal via classe CSS (ex: .with-avatar { height: calc(100% - 240px); }).
- Responsivo: avatar 16:9 até limite 320x180 em mobile, 640x360 desktop.

### 7.1 Inserção no HTML Atual

- Injetar `<div id="avatarShell"><div id="avatarVideo"></div><div id="avatarCaptions" aria-live="polite"></div></div>` logo antes de `<div id="layout">` em `ui.html`.
- Adicionar classe `with-avatar` ao wrapper principal quando avatar ativo para reduzir área do stream: CSS alvo reduz `#stream` altura disponível (ex: max-height calc(100vh - 380px)).

### 7.2 Estilos Sugeridos (draft)

```css
#avatarShell { display:flex; flex-direction:column; align-items:center; gap:4px; margin:8px 0 16px; }
#avatarVideo video { max-width:480px; width:100%; aspect-ratio:16/9; background:#111; border:1px solid #222; border-radius:8px; }
#avatarCaptions { font-size:14px; line-height:1.3; max-width:480px; text-align:center; color:#eee; font-family:system-ui; }
@media (max-width:640px){ #avatarVideo video { max-width:100%; } }
```

### 7.3 Adaptação do Scroll

- Auto-follow existente permanece; ao adicionar avatar, offset inicial do scroll bottom recalculado quando primeiro vídeo inicia.

## 8. Segurança

- Nunca expor chave; token renovado antes da expiração (track TTL ~9 min se token 10 min).
- Cache curto (memory) no backend; sem persistência em disco.
- Token de relay WebRTC (ICE) distinto do token de auth TTS: ambos obtidos server-side; front só recebe dados estritamente necessários.
- Policy CSP recomendada (futuro): `default-src 'self'; script-src 'self' https://aka.ms/csspeech; connect-src 'self' wss://*.microsoft.com https://*.microsoft.com;` (ajustar conforme endpoints regionais).

### 8.3 Renovação de Token (Detalhe)

1. Agendar timer interno após init: `renewAt = expiresAt - 60000`.
2. Ao disparar, se `playing` ou `queueLength>0`, efetuar `fetchToken()` em paralelo e atualizar config; se falhar, retry backoff (limite 3) mantendo sessão antiga até expirar.
3. Se sessão derruba por token inválido antes de renovar, forçar `restartSession()` usando token novo.

### 8.4 Restart Seguro

- Guardar snapshot da fila antes de destruir sessão.
- Cancelar fala atual (`stopSpeakingAsync`) antes de fechar.
- Recriar synthesizer + iniciar avatar + re-enfileirar snapshot.
- Em caso de segunda falha consecutiva: abortar avatar e set `avatar.disabled=true` (fallback puro texto).

### 8.5 Minimização de Superfície

- Não expor escolha arbitrária de personagem/estilo ao usuário final (fixar em config server) na Fase 1.
- Remover parâmetros não usados do sample (backgroundImageUrl livre) para evitar injeções.

### 8.1 Endpoint /avatar/token
- POST sem body, autenticação futura via chave server-side env (ex: SPEECH_KEY, SPEECH_REGION).
- Retorno JSON: `{ token, region, expiresAt }` (expiresAt epoch ms). Token via chamada REST do Azure Speech para obter token speech TTS (não subscription key direta).
- Cache in-memory: renovar se `Date.now() > expiresAt - 60000`.

### 8.2 Hardening
- Limitar origem (CORS) somente nossa UI.
- Rate limit básica (ex: 30 req/h per IP) dado que renovação ocorre a cada ~9 min.
- Não logar token em nível info (apenas debug mascarado).

## 9. Erros & Resiliência
| Cenário | Estratégia |
|---------|-----------|
| Token expirado durante síntese | Interceptar erro, renovar token, repetir última requisição |
| Rede instável | Backoff exponencial (base 500ms, máx 5s, 5 tentativas) |
| Falha irrecuperável | Notificar UI (toast) e fallback texto puro |

### 9.1 Estratégia de Retry
- Exponential backoff: base 500ms, fator 2, jitter ±20%, máx 5s.
- Reclassificar erro: network vs auth vs fatal (fatal: não repetir mais que 1x consecutivo).

### 9.2 Fallback Progressivo
1. Falha speak individual → log + reenfileirar uma vez.
2. Falha repetida >2 no mesmo chunk → descartar chunk e continuar.
3. Sessão corrompida → reiniciar sessão e reprocessar fila inteira (máx 1 tentativa).

### 9.3 Riscos & Mitigações (Detalhado)

| Risco | Impacto | Prob. | Mitigação Primária | Secundária |
|-------|---------|-------|--------------------|-----------|
| Expiração de token no meio de fala | Interrupção áudio | M | Renovar com margem (RENEW_MARGIN_MS) | Retry + restart limitado |
| Falha ICE / WebRTC | Silêncio súbito | M | Restart sessão 1x | Fallback TTS |
| Saturação de fila | Atraso narração | M | MAX_QUEUE_SIZE + descarte baixa prioridade | Sumarização |
| Latência inicial elevada | UX ruim | M | Pré-aquecer após primeiro SSE | Métricas para tuning |
| Vazamento credenciais | Segurança | B | Token efêmero backend | Rotação chave |
| Loop de restart | Recurso desperdiçado | B | RESTART_MAX=1 | Abort + modo silencioso |
| Erro SSML sintaxe | Fala falha | B | Validação local antes speak | Fallback SSML mínimo |

## 10. Telemetria

Eventos sugeridos (enviar para nosso logger existente):

- avatar.init.start / success / fail
- avatar.token.renew.start / success / fail
- avatar.play.start / complete / error
- avatar.queue.size.change
- avatar.session.restart (motivo)
- avatar.speak.chunk (duration_ms, size_chars)
- avatar.token.renew.delay_ms (diferença entre previsto e real)

## 11. Testes (Planejados)

| Tipo | Caso | Resultado Esperado |
|------|------|--------------------|
| Unit | playText sem init | Rejeita com erro claro |
| Unit | queue múltipla | Reproduz em ordem FIFO |
| Integração | token expirado | Renovação transparente |
| Integração | stop durante reprodução | Interrompe e esvazia queue |
| Integração | falha rede inicial | Retentativas até limite |
| Integração | renovação token durante fala | Nenhuma interrupção perceptível |
| Integração | restart sessão (falha ICE) | Fila reprocessada sem duplicar áudio |
| E2E | curso completo com 3 lições | Avatar narra todas na ordem correta |
| E2E | flush end_topic -> inserção resumo | Resumo narrado após terminar chunk atual |
| E2E | final_session -> encerramento | Avatar drena fila e encerra sessão sem erro |

### 11.1 Critérios de Aprov. Narrador

- Latência média speakSsmlAsync < 1200ms chunk local.
- Sobreposição zero (não dois áudios simultâneos).
- Diferença entre texto enfileirado e narrado = 0 (verificação hash simples dos chunks).

### 11.2 Mapeamento Casos ↔ Componentes

| Caso | Componentes Exercitados | Métricas Observadas |
|------|-------------------------|---------------------|
| Token expirado | SessionManager, RetryPolicy | avatar_token_renews, avatar_session_restarts |
| Falha rede inicial | SessionManager, RetryPolicy | avatar_session_restarts |
| Stop durante reprodução | AvatarPlayer | avatar_queue_length (vai a 0) |
| Restart sessão ICE | SessionManager, QueueManager | avatar_session_restarts <=1 |
| Fila saturada (stress) | QueueManager | avatar_queue_length capado, sem leak |

## 14. Pseudocódigo Wrapper avatarPlayer

```ts
// avatarPlayer.ts
type InitOptions = { fetchToken: () => Promise<{ token:string; region:string; expiresAt:number; ice?: { urls:string; username:string; credential:string } }>;
  voice: string; character: string; style: string; enableTransparency?: boolean };

interface QueueItem { id:string; text:string; ssml:string; retries:number }

export class AvatarPlayer {
  private cfg?: InitOptions;
  private speechConfig: any;
  private avatarConfig: any;
  private synthesizer: any;
  private pc: RTCPeerConnection | null = null;
  private queue: QueueItem[] = [];
  private playing = false;
  private tokenExpiresAt = 0;
  private renewTimer?: number;
  private destroyed = false;
  private listeners: Record<string, Function[]> = {};

  async init(cfg: InitOptions){
    this.cfg = cfg;
    const tk = await cfg.fetchToken();
    this.buildConfigs(tk);
    await this.startSession();
    this.scheduleRenew(tk.expiresAt);
    this.emit('ready');
  }
  private buildConfigs(tk){ /* cria SpeechConfig.fromAuthorizationToken(tk.token, tk.region); monta AvatarConfig */ }
  private async startSession(){ /* cria RTCPeerConnection, add transceivers, startAvatarAsync */ }
  private scheduleRenew(expiresAt:number){ this.tokenExpiresAt = expiresAt; const wait = Math.max(1000, expiresAt - Date.now() - 60000); this.renewTimer = window.setTimeout(()=>this.renewToken(), wait); }
  private async renewToken(){ try { const tk = await this.cfg!.fetchToken(); this.tokenExpiresAt = tk.expiresAt; /* atualizar speechConfig auth token */ this.scheduleRenew(tk.expiresAt); this.emit('tokenRenew'); } catch(e){ this.emit('warn', e); /* fallback retry*/ } }
  enqueueText(id:string, raw:string){ const chunks = this.chunk(raw).map((c,i)=>({ id: id+':'+i, text:c, ssml:this.toSSML(c), retries:0 })); for(const ch of chunks){ this.queue.push(ch); } this.emit('queueSize', this.queue.length); this.maybePlayNext(); }
  private maybePlayNext(){ if(this.playing || !this.queue.length) return; const next = this.queue.shift()!; this.playing = true; this.emit('playing', next.id); this.synthesizer.speakSsmlAsync(next.ssml, r=>{ this.playing=false; if(this.destroyed) return; if(r.reason===SpeechSDK.ResultReason.SynthesizingAudioCompleted){ this.emit('chunkComplete', next.id); this.maybePlayNext(); } else { if(next.retries<2){ next.retries++; this.queue.unshift(next); } else { this.emit('error', new Error('chunk failed')); } this.maybePlayNext(); } }, err=>{ this.playing=false; if(next.retries<2){ next.retries++; this.queue.unshift(next); } else { this.emit('error', err); } this.maybePlayNext(); }); }
  stop(){ this.queue=[]; /* stopSpeakingAsync */ this.emit('stopped'); }
  destroy(){ this.destroyed=true; this.stop(); /* close pc & synthesizer */ if(this.renewTimer) clearTimeout(this.renewTimer); }
  on(ev:string, fn:Function){ (this.listeners[ev] ||= []).push(fn); }
  private emit(ev:string, ...a:any[]){ (this.listeners[ev]||[]).forEach(f=>{ try{ f(...a);}catch{} }); }
  private chunk(text:string){ /* implementar chunking conforme 5.3 */ return [text]; }
  private toSSML(text:string){ /* implementar template 5.4 */ return `<speak>${text}</speak>`; }
}
```

## 15. Decisões em Aberto

- Seleção final da voz PT-BR (ex: pt-BR-AntonioNeural vs multilíngue para termos técnicos).
- Se narrar ou não respostas chat_now curtas (propor: apenas >160 chars).
- Implementar modo silencioso (avatar pausado) sem destruir sessão.

## 12. Próximos Passos

1. Preencher seções 2 (detalhes reais) após leitura dos arquivos originais.
2. Validar persona/avatar choices com usuário.
3. Implementar endpoint /avatar/token.
4. Implementar módulo avatarPlayer.
5. Integrar com SSE pipeline (opcional: somente lições, não perguntas).

## 13. Aprovação

Aguardando revisão do usuário antes de iniciar qualquer implementação de código.

---
Status: Draft expandido (2025-08-14T20:49:00Z / revisado com pipeline narrador)
