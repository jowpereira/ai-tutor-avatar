/* WebRTCStrategy (stub inicial Fase B)
 * Objetivo: preparar integração com AvatarSynthesizer/startAvatarAsync mantendo fallback.
 */
import { buildSSML, segmentText } from '/ui/avatarShared.js';

export class WebRTCStrategy {
  constructor(opts){
    this.opts = opts || {}; // { fetchAuthToken, startSession, voice }
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
      this.speechConfig = globalThis.SpeechSDK.SpeechConfig.fromAuthorizationToken(auth.token, auth.region);
      this.speechConfig.speechSynthesisVoiceName = this.opts.voice || 'pt-BR-AntonioNeural';
      // AvatarConfig mínimo (placeholder até vídeo real - não definindo formato custom)
      const videoFormat = new globalThis.SpeechSDK.AvatarVideoFormat();
      const avatarCfg = new globalThis.SpeechSDK.AvatarConfig(this.opts.character||'lisa', this.opts.style||'casual-sitting', videoFormat);
      avatarCfg.remoteIceServers = [{ urls: session.iceServer.urls, username: session.iceServer.username, credential: session.iceServer.credential }];
      this.peer = new RTCPeerConnection({ iceServers: [ { urls: session.iceServer.urls, username: session.iceServer.username, credential: session.iceServer.credential } ] });
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
      this.synth = new globalThis.SpeechSDK.AvatarSynthesizer(this.speechConfig, avatarCfg);
      await this.synth.startAvatarAsync(this.peer);
      // Eventos de marcação de fala (placeholder: SDK real emite visemes / audio events futuramente)
      if(this.synth?.avatarEventReceived){
        this.synth.avatarEventReceived = (s, e) => {
          try {
            if(e?.privAvatarEvent && e.privAvatarEvent.Text){
              this.emit('caption', { text: e.privAvatarEvent.Text });
            }
          } catch(_){}
        };
      }
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
  async stop(){ try { await this.synth?.stopSpeakingAsync(); } catch{} }
  async destroy(){ try { this.synth?.close(); } catch{} try { this.peer?.close(); } catch{} this.ready=false; }
}

export class AvatarController {
  constructor(opts){ // { mode, createTTS, createWebRTC }
    this.mode = opts.mode || 'auto';
    this.opts = opts;
    this.strategy = null; this.fallbackUsed = false;
  }
  async init(){
    if(this.mode === 'tts'){ this.strategy = await this.opts.createTTS(); return { mode:'tts' }; }
    // try webrtc first
    if(this.mode === 'webrtc' || this.mode === 'auto'){
      try {
        this.strategy = await this.opts.createWebRTC();
        return { mode:'webrtc' };
      } catch(e){
        if(this.mode === 'webrtc') throw e; // do not fallback silently in strict mode
        this.fallbackUsed = true;
      }
    }
    // fallback
    this.strategy = await this.opts.createTTS();
    return { mode:'tts_fallback' };
  }
  get activeMode(){ return this.strategy instanceof WebRTCStrategy ? 'webrtc' : 'tts'; }
}
