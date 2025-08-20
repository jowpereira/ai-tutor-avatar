/* WebRTCStrategy (stub inicial Fase B)
 * Objetivo: preparar integração com AvatarSynthesizer/startAvatarAsync mantendo fallback.
 */
/* global RTCPeerConnection MediaStream document requestAnimationFrame */
import { buildSSML, segmentText } from '/ui/avatarShared.js'; // path served from /ui alias

export class WebRTCStrategy {
  constructor(opts){
    this.opts = opts || {}; // { fetchAuthToken, startSession, voice, privateEndpoint, useTcp }
    this.ready = false;
    this.queue = [];
    this.playing = false;
    this.muted = false;
    this.synth = null; // AvatarSynthesizer
    this.peer = null;
    this.listeners = {};
    this.sessionMode = null; // relay | stub
    this.fallback = false;
    this.minAnswerChars = opts.minAnswerChars || 160;
  this.transparent = !!opts.transparentBackground;
  this.videoCrop = !!opts.videoCrop;
  this.backgroundColor = opts.backgroundColor;
  this.backgroundImage = opts.backgroundImage;
  this.customized = !!opts.customized;
  this.useBuiltInVoice = !!opts.useBuiltInVoice;
  this.maxObservedQueue = 0;
  }
  on(ev,fn){ (this.listeners[ev] ||= []).push(fn); };
  emit(ev,p){ (this.listeners[ev]||[]).forEach(f=>{ try{ f(p);}catch(e){ /* noop */ } }); }
  async init(){
    if(!globalThis.SpeechSDK){ this.emit('error',{ reason:'sdk_missing' }); throw new Error('SpeechSDK ausente'); }
    try {
      const auth = await this.opts.fetchAuthToken();
      const session = await this.opts.startSession(); // { iceServer, mode }
      this.sessionMode = session.mode;
      // Montar SpeechConfig
      if(this.opts.privateEndpoint){
        try {
          // Normalizar endpoint: aceitar https://host/ ou wss://host/ e montar caminho websocket correto
          let ep = String(this.opts.privateEndpoint).trim();
          if(!/^https?:/i.test(ep) && !/^wss?:/i.test(ep)) ep = 'https://' + ep.replace(/^\/+/, '');
          const host = ep.replace(/^https?:\/\//i,'').replace(/^wss?:\/\//i,'').replace(/\/$/,'');
          const wsUrl = new URL(`wss://${host}/tts/cognitiveservices/websocket/v1?enableTalkingAvatar=true`);
          // Não passar region como subscriptionKey; iremos usar token
          this.speechConfig = globalThis.SpeechSDK.SpeechConfig.fromEndpoint(wsUrl);
          this.speechConfig.authorizationToken = auth.token;
        } catch(e){
          console.warn('[avatar] privateEndpoint inválido, fallback region auth token', e);
          this.speechConfig = globalThis.SpeechSDK.SpeechConfig.fromAuthorizationToken(auth.token, auth.region);
        }
      } else {
        this.speechConfig = globalThis.SpeechSDK.SpeechConfig.fromAuthorizationToken(auth.token, auth.region);
      }
      this.speechConfig.speechSynthesisVoiceName = this.opts.voice || 'pt-BR-AntonioNeural';
      // AvatarConfig mínimo (placeholder até vídeo real - não definindo formato custom)
      const videoFormat = new globalThis.SpeechSDK.AvatarVideoFormat();
      // Crop range opcional (imitando sample: recorte central menor)
      if(this.videoCrop){
        try {
          // valores inspirados no sample (600..1320)
          const topLeft = new globalThis.SpeechSDK.Coordinate(600,0);
          const bottomRight = new globalThis.SpeechSDK.Coordinate(1320,1080);
          videoFormat.setCropRange(topLeft, bottomRight);
        } catch(e){ console.warn('[avatar] falha setCropRange', e); }
      }
      const avatarCfg = new globalThis.SpeechSDK.AvatarConfig(this.opts.character||'lisa', this.opts.style||'casual-sitting', videoFormat);
      avatarCfg.customized = this.customized;
      avatarCfg.useBuiltInVoice = this.useBuiltInVoice;
      if(this.backgroundColor) avatarCfg.backgroundColor = this.backgroundColor;
      if(this.backgroundImage) avatarCfg.backgroundImage = this.backgroundImage;
      // Transformar ICE URL se uso TCP solicitado (paridade com sample Azure: substitui :3478 -> :443?transport=tcp e força relay)
      const transformIceUrl = (url, useTcp) => {
        if(!useTcp) return url;
        try {
          // Apenas manipula porta padrão 3478 se presente; caso contrário adiciona 443
            const qIndex = url.indexOf('?');
            const base = qIndex >= 0 ? url.slice(0,qIndex) : url;
            const restQuery = qIndex >= 0 ? url.slice(qIndex+1) : '';
            let replaced = base.replace(':3478',':443');
            if(replaced === base && !/:[0-9]+$/.test(base)){ // sem porta explícita
              // inserir :443 antes de qualquer query (já removida)
              replaced = replaced + ':443';
            }
            // Reaplica query existente + transport=tcp
            const hasTransport = /transport=tcp/i.test(url);
            const queryParts = [];
            if(restQuery) queryParts.push(restQuery);
            if(!hasTransport) queryParts.push('transport=tcp');
            return queryParts.length ? `${replaced}?${queryParts.join('&')}` : `${replaced}?transport=tcp`;
        } catch{ return url; }
      };
      let iceUrl = transformIceUrl(session.iceServer.urls, !!this.opts.useTcp);
      avatarCfg.remoteIceServers = [{ urls: iceUrl, username: session.iceServer.username, credential: session.iceServer.credential }];
      this.peer = new RTCPeerConnection({ 
        iceServers: [ { urls: iceUrl, username: session.iceServer.username, credential: session.iceServer.credential } ],
        iceTransportPolicy: this.opts.useTcp ? 'relay' : 'all'
      });
      this.peer.oniceconnectionstatechange = () => {
        console.debug('[avatar.webrtc_ice_state]', { state: this.peer.iceConnectionState });
      };
      // Vincular tracks de mídia remota ao <video> fornecido (se houver)
      const videoEl = this.opts.videoEl;
      if(videoEl){
        this.peer.addEventListener('track', ev => {
          if(ev.streams && ev.streams[0]){
            videoEl.srcObject = ev.streams[0];
          } else if(ev.track){
            // fallback: construir stream manual
            const ms = videoEl.srcObject instanceof MediaStream ? videoEl.srcObject : new MediaStream();
            ms.addTrack(ev.track);
            videoEl.srcObject = ms;
          }
        });
      }
  this.peer.addTransceiver('video',{ direction:'sendrecv' });
  this.peer.addTransceiver('audio',{ direction:'sendrecv' });
  // Workaround para garantir recepção de eventos (subtitles) via datachannel
  try { this.peer.createDataChannel('eventChannel'); } catch(e){ /* ignore */ }
      this.synth = new globalThis.SpeechSDK.AvatarSynthesizer(this.speechConfig, avatarCfg);
      const startTs = performance.now();
      try {
              const r = await this.synth.startAvatarAsync(this.peer);
              if(r && r.reason && r.reason !== globalThis.SpeechSDK.ResultReason.SynthesizingAudioCompleted){
                if(r.reason === globalThis.SpeechSDK.ResultReason.Canceled){
                  try {
                    const cd = globalThis.SpeechSDK.CancellationDetails.fromResult(r);
                    console.warn('[avatar.webrtc_start_canceled]', { reason: cd.reason, errorDetails: cd.errorDetails });
                    throw new Error('avatar_start_canceled:'+cd.errorDetails);
                  } catch(inner){ /* ignore */ }
                }
              }
      } catch(err){
        const dur = Math.round(performance.now() - startTs);
        console.warn('[avatar.webrtc_start_fail]', { dur, error: String(err) });
        throw err;
      }
      const dur = Math.round(performance.now() - startTs);
      console.debug('[avatar.webrtc_start_ms]', dur);
      // Chroma key (background transparente) se habilitado
      if(this.transparent && videoEl){
        try {
          videoEl.addEventListener('play', ()=>{
            const canvas = this.opts.transparentCanvas || document.getElementById('avatarChromaCanvas');
            if(!canvas) return; const tmp = document.createElement('canvas');
            const ctx = canvas.getContext('2d'); const tctx = tmp.getContext('2d', { willReadFrequently: true });
            const process = ()=>{
              if(videoEl.paused || videoEl.ended){ return; }
              const w = videoEl.videoWidth; const h = videoEl.videoHeight; if(!w||!h){ requestAnimationFrame(process); return; }
              canvas.width = w; canvas.height = h; tmp.width=w; tmp.height=h;
              tctx.drawImage(videoEl,0,0,w,h); const frame = tctx.getImageData(0,0,w,h); const data = frame.data;
              for(let i=0;i<data.length;i+=4){ const r=data[i], g=data[i+1], b=data[i+2]; if(g - 150 > r + b){ data[i+3]=0; } else if(g+g > r + b){ const adjustment=(g - (r+b)/2)/3; let nr=r+adjustment; let ng=g-adjustment*2; let nb=b+adjustment; const a=Math.max(0,255 - adjustment*4); data[i]=nr; data[i+1]=ng; data[i+2]=nb; data[i+3]=a; } }
              ctx.putImageData(frame,0,0); requestAnimationFrame(process);
            };
            requestAnimationFrame(process);
          });
        } catch(e){ console.warn('[avatar] chroma init fail', e); }
      }
      // Eventos de marcação de fala (placeholder: SDK real emite visemes / audio events futuramente)
      if(this.synth){
        this.synth.avatarEventReceived = (s, e) => {
          try {
            if(e?.privAvatarEvent){
              const evt = e.privAvatarEvent;
              if(evt.Text){ this.emit('caption', { text: evt.Text }); }
            }
          } catch(_){ /* ignore */ }
        };
      }
      // Listener para datachannel legendas / eventos TURN_START etc
      this.peer.addEventListener('datachannel', ev => {
        try {
          const ch = ev.channel;
          ch.onmessage = (msgEv) => {
            try {
              const webRTCEvent = JSON.parse(msgEv.data);
              const type = webRTCEvent?.event?.eventType;
              if(type === 'EVENT_TYPE_TURN_START'){
                    if(this.opts.showSubtitles !== false && webRTCEvent.spokenText){ this.emit('caption',{ text: webRTCEvent.spokenText }); }
              } else if(type === 'EVENT_TYPE_SESSION_END' || type === 'EVENT_TYPE_SWITCH_TO_IDLE'){
                this.emit('caption',{ text: '' });
              }
              console.debug('[avatar.webrtc_event]', { type, raw: webRTCEvent });
            } catch(err){ /* parse ignore */ }
          };
        } catch(err){ /* ignore */ }
      });
      this.ready = true;
      this.emit('ready',{ mode: this.sessionMode });
      this.maybePlayNext();
    } catch(e){
      this.emit('error',{ reason:'init_fail', error: String(e) });
      throw e;
    }
  }
  
  enqueueLesson(lesson){ if(!lesson?.content) return; const text = lesson.content.replace(/\n+Referências:[\s\S]*/i,'').trim(); this.enqueueText('lesson:'+lesson.id, text); }
  enqueueInsert(insert){ if(!insert?.text || insert.pending || insert.mode==='pause') return; let prefix=''; if(insert.mode==='end_topic') prefix='Resumo do tópico: '; if(insert.mode==='final_session') prefix='Encerramento: '; this.enqueueText('insert:'+insert.id, prefix+insert.text.trim()); }
  enqueueAnswer(answer){ if(!answer?.answer) return; const t=answer.answer.trim(); if(t.length < this.minAnswerChars) return; this.enqueueText('answer:'+(answer.questionId||Date.now()), 'Resposta: '+t); }
  enqueueText(baseId, text){ if(!text) return; const segments = text.length>450? segmentText(text):[text]; segments.forEach((seg,i)=> this.queue.push({ id: baseId+':'+i, text: seg })); this.emit('queue',{ size: this.queue.length }); this.maybePlayNext(); }
  async maybePlayNext(){ if(this.playing || !this.queue.length || !this.ready || this.muted) return; const next = this.queue.shift(); this.playing=true; this.emit('playing',{ id: next.id });
    try { const ssml = buildSSML(next.text, this.opts.voice); const r = await this.synth.speakSsmlAsync(ssml); this.emit('chunkComplete',{ id: next.id, reason: r?.reason }); }
    catch(e){ this.emit('speech_error',{ id: next.id, error: String(e) }); }
    finally { this.playing=false; this.maybePlayNext(); }
  }
  setMuted(m){ this.muted=!!m; if(!this.muted) this.maybePlayNext(); }
  async stop(){ try { await this.synth?.stopSpeakingAsync(); } catch(e){ /* ignore stop error */ } }
  async destroy(){ try { this.synth?.close(); } catch(e){ /* ignore synth close */ } try { this.peer?.close(); } catch(e){ /* ignore peer close */ } this.ready=false; }
  cancelCurrent(){ try { this.synth?.stopSpeakingAsync(()=>{},()=>{}); } catch{ /* ignore */ } }
}

export class AvatarController {
  constructor(opts){ // { mode, createTTS, createWebRTC }
    this.mode = opts.mode || 'auto';
    this.opts = opts;
    this.strategy = null; this.fallbackUsed = false;
  }
  async init(){
    if(this.mode === 'tts'){
      this.strategy = await this.opts.createTTS();
      return { mode:'tts' };
    }
    // Sem fallback: tentar WebRTC e lançar erro se falhar
    this.strategy = await this.opts.createWebRTC();
    return { mode:'webrtc' };
  }
  get activeMode(){ return this.strategy instanceof WebRTCStrategy ? 'webrtc' : 'tts'; }
}
