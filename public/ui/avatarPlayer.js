/* AvatarPlayer stub v0: gerencia fila de chunks e usa Speech SDK se disponível */
// Esta é uma implementação mínima alinhada ao design. Fase 1: apenas sintetiza áudio (sem vídeo) se SDK presente.

export class AvatarPlayer {
  constructor(opts){
    this.opts = opts || {};
    this.queue = [];
    this.playing = false;
    this.initialized = false;
    this.listeners = {};
    this.tokenInfo = null;
    this.synthesizer = null;
    this.muted = false;
    this.minAnswerChars = this.opts.minAnswerChars || 160;
  // Controle de token / sessão
  this.tokenExpiresAt = 0; // epoch ms
  this.renewTimer = null;
  this.RENEW_MARGIN_MS = 60 * 1000; // renovar 1 min antes expirar
  this.TOKEN_TTL_MS = 9 * 60 * 1000; // cache server ~9m
  this.sessionId = Math.random().toString(36).slice(2,10);
  this.seq = 0;
  this.speechConfig = null;
  }
  on(ev,fn){ (this.listeners[ev] ||= []).push(fn); }
  emit(ev,p){ (this.listeners[ev]||[]).forEach(f=>{ try{ f(p);}catch(err){ console.debug('[avatar] listener err', err); } }); }
  async init(){
    if(this.initialized) return;
    if(!globalThis.SpeechSDK){ console.warn('[avatar] SpeechSDK não carregado – modo silencioso'); this.initialized = true; this.emit('ready'); return; }
    const tk = await this.opts.fetchToken();
    this.tokenInfo = tk;
  this.speechConfig = globalThis.SpeechSDK.SpeechConfig.fromAuthorizationToken(tk.token, tk.region);
  this.speechConfig.speechSynthesisVoiceName = this.opts.voice || 'pt-BR-AntonioNeural';
  this.synthesizer = new globalThis.SpeechSDK.SpeechSynthesizer(this.speechConfig);
  this.tokenExpiresAt = Date.now() + this.TOKEN_TTL_MS;
  this.scheduleRenew();
    this.initialized = true;
    this.emit('ready');
  this.emitMetric('init_success');
  }
  enqueueLesson(lesson){
    if(!lesson || !lesson.content) return;
    const text = lesson.content.replace(/\n+Referências:[\s\S]*/i,'').trim();
    this.enqueueText('lesson:'+lesson.id, text);
  }
  enqueueInsert(insert){
    if(!insert || !insert.text) return;
    if(insert.mode === 'pause' || insert.pending) return; // não narrar placeholder
    let prefix='';
    if(insert.mode === 'end_topic') prefix='Resumo do tópico: ';
    if(insert.mode === 'final_session') prefix='Encerramento da sessão: ';
    this.enqueueText('insert:'+insert.id, prefix + insert.text.trim());
  }
  enqueueAnswer(answer){
    if(!answer || !answer.answer) return;
    const t = answer.answer.trim();
    if(t.length < this.minAnswerChars) return; // ignorar respostas curtas
    this.enqueueText('answer:'+ (answer.questionId||Date.now()), 'Resposta: ' + t);
  }
  enqueueText(baseId, text){
    if(!text) return;
    const segments = text.length>450 ? this.segment(text) : [text];
  segments.forEach((seg,i)=> this.queue.push({ id: baseId+':'+i, text: seg }));
    this.emit('queueSize',{ size: this.queue.length });
  this.emitMetric('enqueue',{ items: segments.length, qlen: this.queue.length });
    this.maybePlayNext();
  }
  segment(txt){
    const out=[]; let buf='';
    const sentences = txt.split(/(?<=[.!?])\s+/);
    for(const s of sentences){
      if((buf + ' ' + s).trim().length > 400){ if(buf) out.push(buf.trim()); buf = s; } else { buf = (buf? buf+' ':'') + s; }
    }
    if(buf) out.push(buf.trim());
    return out;
  }
  maybePlayNext(){
    if(this.playing || !this.queue.length || !this.initialized || this.muted) return;
    const next = this.queue.shift();
    if(!this.synthesizer){ /* modo silencioso: apenas consumir */ this.emit('chunkComplete',{ id: next.id }); this.maybePlayNext(); return; }
    this.playing = true; 
    this.emit('playing',{ chunkId: next.id, text: next.text });
    const ssml = this.toSSML(next.text);
    const started = performance.now();
  this.synthesizer.speakSsmlAsync(ssml, () => {
      this.playing = false;
      this.emit('chunkComplete',{ id: next.id });
      this.emitMetric('speech_ok',{ chars: next.text.length, durMs: performance.now()-started });
      this.maybePlayNext();
    }, err => {
      console.warn('[avatar] erro speak', err);
      this.emitMetric('speech_err',{ message: String(err).slice(0,120) });
      this.playing = false; this.maybePlayNext();
    });
  }
  toSSML(text){
    return `<?xml version='1.0'?><speak version='1.0' xml:lang='pt-BR'><voice name='${this.opts.voice||'pt-BR-AntonioNeural'}'>${this.escape(text)}</voice></speak>`;
  }
  escape(t){ return t.replace(/&/g,'&amp;').replace(/</g,'&lt;'); }
  stop(){ this.queue=[]; try { this.synthesizer?.close(); } catch(err){ /* log opcional */ } this.playing=false; }
  destroy(){ this.stop(); this.initialized=false; }
  setMuted(m){
    this.muted = !!m;
  if(this.muted && this.playing && this.synthesizer){ try { this.synthesizer.stopSpeakingAsync(()=>{},()=>{}); } catch(err){ /* ignore */ } this.playing=false; }
    if(!this.muted) this.maybePlayNext();
  }
  scheduleRenew(){
    clearTimeout(this.renewTimer);
    const delay = Math.max(5000, this.tokenExpiresAt - Date.now() - this.RENEW_MARGIN_MS);
    this.renewTimer = setTimeout(()=> this.renewToken(), delay);
  }
  async renewToken(){
    try {
      const tk = await this.opts.fetchToken();
      if(!tk || !tk.token) throw new Error('token vazio');
      this.speechConfig.authorizationToken = tk.token;
      this.tokenExpiresAt = Date.now() + this.TOKEN_TTL_MS;
      this.scheduleRenew();
      this.emitMetric('token_renew_ok');
    } catch(err){
      console.warn('[avatar] falha renovar token', err);
      this.emitMetric('token_renew_err');
      clearTimeout(this.renewTimer);
      this.renewTimer = setTimeout(()=> this.renewToken(), 30_000);
    }
  }
  emitMetric(event, extra){
    try {
      const payload = { ts: Date.now(), event, sid: this.sessionId, seq: this.seq++, ...extra };
      console.debug('[avatar-metric]', payload);
  } catch(err){ /* ignore metric error */ }
  }
}

export async function createAvatar(){
  const player = new AvatarPlayer({
    fetchToken: async () => {
      const res = await fetch('/avatar/token',{ method:'POST' });
      if(!res.ok) throw new Error('token_fetch_failed');
      return await res.json();
    },
  voice: 'pt-BR-AntonioNeural',
  minAnswerChars: 160
  });
  await player.init();
  return player;
}
