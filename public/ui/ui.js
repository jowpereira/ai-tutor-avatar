/* global document window EventSource */
import { createAvatar } from '/ui/avatarPlayer.js';
import { WebRTCStrategy, AvatarController } from '/ui/avatarWebRTC.js';
// Estado global
let totalPlanned = 0, received = 0, completed = 0;
let source = null; // EventSource
let activeTyping = 0; // lições sendo digitadas no modo batch
let pendingDone = false;
let lessonQueue = []; // fila de lições no modo batch
let isTyping = false;
let logBuffer = [];
// Buffer para inserts (pausa / fim de tópico) enquanto lição está sendo "digitada"
let pendingInsertQueue = [];
// Rastreamento de placeholders (ex: end_topic pendente) para atualizações incrementais
let placeholderMap = { end_topic: null };
let avatarPlayer = null; let avatarEnabled = true; let avatarReady = false; let avatarController = null;
// Buffer de fala incremental (streaming para avatar WebRTC enquanto "digitamos")
let currentSpeakBuffer = '';
let speakChunkIdx = 0;
let streamingLessonId = null;
const avatarShell = document.getElementById('avatarShell');
const avatarToggle = document.getElementById('avatarToggle');
const avatarMute = document.getElementById('avatarMute');
const avatarVideoEl = document.getElementById('avatarVideo');
const avatarCaptionsEl = document.getElementById('avatarCaptions');
// (modo token removido)

// Elementos
const startBtn = document.getElementById('startBtn');
const streamBtn = document.getElementById('streamBtn');
const nextLessonBtn = document.getElementById('nextLessonBtn');
const pulseBtn = document.getElementById('pulseBtn');
const streamDiv = document.getElementById('stream');
const statusEl = document.getElementById('status');
const headerEl = document.getElementById('header');
const bar = document.getElementById('bar');
const percentageEl = document.getElementById('percentage');
const followBtn = document.getElementById('followBtn');
let autoFollow = true;
// Chat elements
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const answersDiv = document.getElementById('answers');
// Pending grouped lists
const listNow = document.getElementById('pendingListNow');
const listPause = document.getElementById('pendingListPause');
const listEnd = document.getElementById('pendingListEnd');
const listFinal = document.getElementById('pendingListFinal');
const listNotes = document.getElementById('pendingListNotes');
const countPause = document.getElementById('countPause');
const countEnd = document.getElementById('countEnd');
const countFinal = document.getElementById('countFinal');
const countNotes = document.getElementById('countNotes');
// New controls
const refreshBtn = document.getElementById('refreshChat');
const toggleAllBtn = document.getElementById('toggleAll');
const hideImmediateChk = document.getElementById('hideImmediate');
let lastChatRefresh = 0;
let chatPolling = false;
let chatStateCache = { answers: [], questionsQueue: [], broadcastQueue: [] };
const speedRange = document.getElementById('speedRange');
let typingDelay = 25;
speedRange?.addEventListener('input', ()=>{ typingDelay = parseInt(speedRange.value,10) || 25; });

function scrollToBottom(){ if(autoFollow){ streamDiv.scrollTop = streamDiv.scrollHeight; } }

function appendText(text, className=''){
  const span = document.createElement('span');
  if(className) span.className = className;
  span.textContent = text;
  streamDiv.appendChild(span);
  scrollToBottom();
}

function updateBar(){
  if(!totalPlanned){ bar.style.width='0'; percentageEl.textContent='0%'; statusEl.textContent='⌛ 0/0'; return; }
  const pct = Math.min(100, (completed/totalPlanned)*100);
  bar.style.width = pct + '%';
  percentageEl.textContent = Math.round(pct) + '%';
  statusEl.textContent = '🧪 ' + completed + '/' + received + '/' + totalPlanned;
}

function finalizeIfReady(){
  if(pendingDone && activeTyping === 0){
    if(completed < received) completed = received;
    if(completed < totalPlanned && received === totalPlanned) completed = totalPlanned;
    updateBar();
  statusEl.textContent='🎉 Concluído';
  streamBtn.disabled=true;
  streamBtn.innerHTML='✅ Finalizado';
  headerEl.textContent='🏁 Curso completo!';
  appendText('\n🎊 Curso gerado com sucesso! Total: ' + received + ' lições.');
  if(source){ source.close(); source=null; }
  }
}

function typeContentSequential(content, references, onDone){
  activeTyping++; isTyping = true;
  if(nextLessonBtn) nextLessonBtn.disabled=true;
  const chars = [...content];
  let idx = 0;
  // reset buffers para nova lição (streaming incremental)
  currentSpeakBuffer=''; speakChunkIdx=0;
  const interval = setInterval(()=>{
    if(idx < chars.length){
      const ch = chars[idx];
      if(ch === '\n') streamDiv.appendChild(document.createElement('br')); else {
        const s = document.createElement('span'); s.textContent = ch; streamDiv.appendChild(s);
      }
      // Acumular para avatar streaming (somente modo webrtc)
      if(avatarReady && avatarController && avatarController.activeMode === 'webrtc'){
        if(!streamingLessonId) streamingLessonId = headerEl.textContent?.replace('✍️ Gerando: ','') || ('L'+Date.now());
        currentSpeakBuffer += ch;
        // Condições de flush: fim de sentença (.!?), quebra de linha, ou buffer muito longo
        const isSentenceEnd = /[.!?]$/.test(currentSpeakBuffer.trim());
        const overLen = currentSpeakBuffer.length > 200; // flush preventivo
        if(isSentenceEnd || overLen){
          const textToSpeak = currentSpeakBuffer.trim();
          if(textToSpeak.length > 8 && avatarPlayer && avatarPlayer.enqueueText){
            try { avatarPlayer.enqueueText('live:'+streamingLessonId+':'+(speakChunkIdx++), textToSpeak); } catch{ /* noop */ }
          }
          currentSpeakBuffer='';
        }
      }
      idx++; scrollToBottom();
    } else {
      clearInterval(interval);
      // Flush final do que restar no buffer
      if(currentSpeakBuffer.trim().length>8 && avatarReady && avatarController?.activeMode==='webrtc' && avatarPlayer?.enqueueText){
        try { avatarPlayer.enqueueText('live:'+ (streamingLessonId||('L'+Date.now())) +':'+(speakChunkIdx++), currentSpeakBuffer.trim()); } catch{ /* ignore */ }
      }
      currentSpeakBuffer=''; streamingLessonId=null;
      if(references && references.length){
        const lower = content.toLowerCase();
        if(!lower.includes('referências:')){
          appendText('\n');
          const refSpan = document.createElement('div'); refSpan.className='citation'; refSpan.textContent='Referências: ' + references.join(' '); streamDiv.appendChild(refSpan);
        }
      }
      appendText('\n\n');
      // Após concluir a digitação desta lição, se não houver outras em andamento, flush dos inserts pendentes
      completed++; updateBar(); activeTyping--; isTyping=false; finalizeIfReady();
      if(logBuffer.length){ for(const entry of logBuffer){ appendText(entry+'\n','citation'); } logBuffer=[]; }
      if(activeTyping === 0 && pendingInsertQueue.length){
        // Garantir ordem FIFO dos inserts acumulados durante typing
        const queue = [...pendingInsertQueue]; pendingInsertQueue=[];
        for(const ins of queue){ renderInsertBlock(ins); }
      }
  if(nextLessonBtn && !pendingDone) nextLessonBtn.disabled=false;
      onDone();
    }
  }, typingDelay);
}

// Renderização isolada de bloco de inserts (pausa / fim de tópico)
function renderInsertBlock(ins){
  const isPending = !!ins.pending;
  const mode = ins.mode;
  const isEndTopic = mode === 'end_topic';
  const isPause = mode === 'pause';
  const isFinalSession = mode === 'final_session';
  const count = (ins.questionIds && ins.questionIds.length) || 0;
  let sepLabel;
  if(isEndTopic){
    sepLabel = isPending ? '⏳ Fim do Tópico – Coletando Perguntas ('+count+')' : '🔚 Fim do Tópico – Perguntas Respondidas';
  } else if(isPause){
    sepLabel = '⏸️ Pausa – Perguntas Respondidas';
  } else if(isFinalSession){
    sepLabel = '🏁 Fim da Sessão – Perguntas Respondidas';
  } else {
    sepLabel = '📌 Bloco';
  }

  // Atualização incremental para placeholder END_TOPIC
  if(isEndTopic && isPending){
    // Se já existe um block pendente, apenas atualizar
    if(placeholderMap.end_topic){
      const headerElExisting = placeholderMap.end_topic.header;
      const blockElExisting = placeholderMap.end_topic.block;
      if(headerElExisting) headerElExisting.textContent = sepLabel;
      if(blockElExisting){
        const tsNode = blockElExisting.querySelector('[data-kind="ts"]');
        if(tsNode) tsNode.textContent = new Date().toLocaleTimeString();
        const bodyNode = blockElExisting.querySelector('[data-kind="body"]');
        if(bodyNode) bodyNode.textContent = ins.text||'';
      }
      scrollToBottom();
      return;
    }
  }

  // Se final end_topic chegou, remover placeholder anterior
  if(isEndTopic && !isPending && placeholderMap.end_topic){
    const wrap = placeholderMap.end_topic.wrapper;
    if(wrap && wrap.parentElement) wrap.parentElement.removeChild(wrap);
    placeholderMap.end_topic = null;
  }

  // Criar wrapper + header
  appendText('\n');
  const wrapper = document.createElement('div');
  wrapper.className = 'insert-wrapper';
  wrapper.dataset.insertId = ins.id;
  wrapper.dataset.insertMode = mode;
  if(isPending) wrapper.dataset.pending = 'true';

  const header = document.createElement('div');
  header.className = 'lesson-separator';
  header.textContent = sepLabel;
  wrapper.appendChild(header);

  const block = document.createElement('div');
  block.className='answer-broadcast-block';
  block.style.border='1px solid #334155';
  block.style.padding='8px';
  block.style.margin='4px 0 14px';
  block.style.background='#1c2128';
  const tsDiv = document.createElement('div'); tsDiv.style.fontSize='12px'; tsDiv.style.opacity='.7'; tsDiv.style.marginBottom='4px'; tsDiv.dataset.kind='ts'; tsDiv.textContent=new Date().toLocaleTimeString();
  const bodyDiv = document.createElement('div'); bodyDiv.style.whiteSpace='pre-wrap'; bodyDiv.dataset.kind='body'; bodyDiv.textContent=ins.text||'';
  block.appendChild(tsDiv); block.appendChild(bodyDiv);
  wrapper.appendChild(block);
  streamDiv.appendChild(wrapper);
  scrollToBottom();

  if(isEndTopic && isPending){
    placeholderMap.end_topic = { wrapper, header, block };
  }
}

function processQueue(){
  if(isTyping) return;
  const next = lessonQueue.shift(); if(!next) return;
  const { lesson } = next;
  const title = '\n\n📖 ' + (lesson.subtaskId || lesson.id) + '\n'; appendText(title, 'lesson-separator');
  const raw = lesson.content || '';
  const citations = (raw.match(/\[\[ref:[^\]]+\]\]/g)||[]).map(c=>c.replace('[[ref:','').replace(']]',''));
  let clean = raw.replace(/\[\[ref:[^\]]+\]\]/g,'');
  clean = clean.replace(/\n+Referências?:[\s\S]*$/i,'');
  clean = clean.split(/\n+/).map(p=>p.split(/(?<=[.!?])\s+/).map(sentence=>{
    const words = sentence.trim().split(/\s+/); if(words.length<=25) return sentence;
    const chunks=[]; let buf=[]; for(const w of words){ buf.push(w); if(buf.length>=18){ chunks.push(buf.join(' ') + '.'); buf=[]; } }
    if(buf.length) chunks.push(buf.join(' ') + '.'); return chunks.join(' ');
  }).join(' ')).join('\n');
  headerEl.textContent='✍️ Gerando: ' + (lesson.subtaskId || lesson.id);
  typeContentSequential(clean.trim(), citations, ()=>processQueue());
}

function addLesson(lesson){ received++; lessonQueue.push({ lesson }); processQueue(); }
function narrateLesson(lesson){
  if(!avatarEnabled || !avatarPlayer || !avatarReady) return;
  // Se estamos em modo WebRTC usamos streaming incremental durante a digitação; evitar duplicar conteúdo completo
  if(avatarController?.activeMode === 'webrtc') return;
  avatarPlayer.enqueueLesson(lesson); // TTS fallback ou modo tts
}

async function initCourse(){
  try {
    startBtn.disabled=true; streamBtn.disabled=true; if(nextLessonBtn) nextLessonBtn.disabled=true; if(pulseBtn) pulseBtn.disabled=true;
    statusEl.textContent='🔄 Inicializando...'; headerEl.textContent='🎯 Preparando curso...'; streamDiv.innerHTML='';
    totalPlanned=0; received=0; completed=0; pendingDone=false; activeTyping=0; lessonQueue=[]; updateBar();
    const res = await fetch('/events',{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({type:'build_course'})});
    if(!res.ok) throw new Error('Falha ao inicializar');
    const js = await res.json();
    totalPlanned = (js.result?.todo?.[0]?.subtasks?.length || 0) + (js.result?.todo?.slice(1)?.reduce((a,t)=>a+(t.subtasks?.length||0),0) || 0);
    statusEl.textContent='✅ Pronto para stream'; headerEl.textContent='📋 Curso carregado ('+totalPlanned+' lições)';
    streamBtn.disabled=false; if(nextLessonBtn) nextLessonBtn.disabled=false; if(pulseBtn) pulseBtn.disabled=false; appendText('🎓 Sistema pronto! Total de '+totalPlanned+' lições.\n\n');
    // Carrega config avatar
    let avatarCfg = {};
  try { const cfgRes = await fetch('/avatar/config'); if(cfgRes.ok) avatarCfg = await cfgRes.json(); } catch(_){ /* ignore */ }
    window.AVATAR_CONFIG = avatarCfg; // debug
    try {
      avatarController = new AvatarController({
        mode: (window.AVATAR_MODE || avatarCfg.mode || 'auto'),
        createTTS: async () => {
      const p = await createAvatar(); // avatarCfg could later tune voice
          avatarPlayer = p; avatarReady = true;
          p.on('playing', (ev) => { 
            if(avatarCaptionsEl && ev.chunkId) {
              const currentText = p.queue[0]?.text || 'Reproduzindo áudio...';
              avatarCaptionsEl.textContent = currentText.slice(0, 80) + (currentText.length > 80 ? '...' : '');
            }
          });
            p.on('chunkComplete', () => { if(avatarCaptionsEl) avatarCaptionsEl.textContent = ''; });
          return p;
        },
        createWebRTC: async () => {
          const strat = new WebRTCStrategy({
            fetchAuthToken: async () => { const r = await fetch('/avatar/token',{method:'POST'}); if(!r.ok) throw new Error('token_fail'); return await r.json(); },
            startSession: async () => { const r = await fetch('/avatar/session/start',{method:'POST'}); if(!r.ok) throw new Error('session_fail'); return await r.json(); },
            voice: 'pt-BR-AntonioNeural',
            privateEndpoint: avatarCfg.privateEndpoint,
            useTcp: avatarCfg.useTcpForWebRtc ?? avatarCfg.useTcp,
            character: avatarCfg.character || (window.AVATAR_CHARACTER||'lisa'),
            style: avatarCfg.style || (window.AVATAR_STYLE||'casual-sitting'),
            videoEl: avatarVideoEl,
            minAnswerChars: 160
          });
          strat.on('ready',()=>{ avatarPlayer = strat; avatarReady = true; });
          strat.on('caption', ev => { if(avatarCaptionsEl){ avatarCaptionsEl.textContent = ev.text; } });
          strat.on('error',(e)=>{ console.warn('[avatar-webrtc-error]', e); });
          await strat.init();
          return strat;
        }
      });
      const modeInfo = await avatarController.init();
      console.debug('[avatar-controller] mode', modeInfo);
      if(avatarShell){ avatarShell.style.display='flex'; document.body.classList.add('with-avatar'); }
    } catch(e){
      console.warn('[avatar-controller-init-fail]', e);
      if(avatarShell){ avatarShell.style.display='flex'; document.body.classList.add('with-avatar'); }
    }
    // Helper simples para enviar texto manual ao avatar
    window.avatarSpeak = (text) => {
      if(!text || !avatarPlayer) return false;
      if(avatarPlayer.enqueueText) avatarPlayer.enqueueText('manual:'+Date.now(), text); else if(avatarPlayer.enqueueLesson){ avatarPlayer.enqueueText('manual:'+Date.now(), text); }
      return true;
    };
  } catch(e){
    statusEl.textContent='❌ Erro ao iniciar'; headerEl.textContent='⚠️ Falha na preparação'; startBtn.disabled=false;
    appendText('\n❌ '+(e.message||e.toString()));
    console.error('[initCourse_error]', e);
  }
}

function toggleStream(){
  // único modo ativo
  if(source){ source.close(); source=null; streamBtn.innerHTML='▶️ Stream'; statusEl.textContent='⏹️ Parado'; headerEl.textContent='⏸️ Stream pausado'; return; }
  streamBtn.innerHTML='⏹️ Parar'; statusEl.textContent='🔴 Streaming...'; headerEl.textContent='🤖 IA gerando conteúdo...'; appendText('🚀 Iniciando geração com IA...\n\n');
  source = new EventSource('/course/stream');
  source.addEventListener('lesson', ev=>{ const data = JSON.parse(ev.data); addLesson(data); narrateLesson(data); });
  source.addEventListener('log', ev=>{ const data=JSON.parse(ev.data); if(isTyping){ logBuffer.push('ℹ️ '+data.msg); } else { appendText('ℹ️ '+data.msg+'\n','citation'); } });
  source.addEventListener('heartbeat', ev => {
    try {
      const data = JSON.parse(ev.data);
      if(data.paused){
        headerEl.textContent = '⏸️ Pausa (orquestrando respostas)';
      } else if(!isTyping) {
        headerEl.textContent='🤖 IA gerando conteúdo...';
      }
    } catch(e){ /* ignore */ }
  });
  source.addEventListener('insert', ev => {
    try {
      const payload = JSON.parse(ev.data); // { type:'insert', data: {...}}
      const ins = payload.data || payload;
      // Para placeholder pendente end_topic, queremos atualizações mesmo durante typing (após flush de lesson)
      if(isTyping || activeTyping>0){
        // substitui qualquer existente no buffer com mesmo id (mantém só último estado)
        const idx = pendingInsertQueue.findIndex(x=>x.id===ins.id);
        if(idx>=0) pendingInsertQueue[idx]=ins; else pendingInsertQueue.push(ins);
      } else {
        renderInsertBlock(ins);
      }
      if(!ins.pending && avatarPlayer) avatarPlayer.enqueueInsert(ins);
    } catch(e){ /* ignore */ }
  });
  source.addEventListener('classified', ev => {
    try {
      const data = JSON.parse(ev.data); // {id, route, ts, reason}
      // Apenas log leve para debugging de sincronização
      appendText(`ℹ️ classificado: ${data.id} → ${data.route}\n`, 'citation');
    } catch(e){ /* ignore */ }
  });
  source.addEventListener('done', ()=>{ pendingDone=true; finalizeIfReady(); });
  source.onerror = ()=>{ statusEl.textContent='❌ Erro'; streamBtn.innerHTML='▶️ Stream'; streamBtn.disabled=false; headerEl.textContent='⚠️ Conexão perdida'; if(source){source.close(); source=null;} appendText('\n❌ Erro na conexão. Tente novamente.'); };
}

startBtn.addEventListener('click', initCourse);
streamBtn.addEventListener('click', toggleStream);
nextLessonBtn?.addEventListener('click', async ()=>{
  nextLessonBtn.disabled=true;
  try {
    const res = await fetch('/course/next/one',{method:'POST'});
    if(res.ok){ /* SSE loop enviará se nova lição foi criada */ }
  } finally { if(!pendingDone) nextLessonBtn.disabled=false; }
});

pulseBtn?.addEventListener('click', async ()=>{
  pulseBtn.disabled=true;
  try {
    const res = await fetch('/chat/pulse',{method:'POST'});
    if(res.ok){ await fetchChatState(true); }
  } finally { if(!pendingDone) pulseBtn.disabled=false; }
});

// Auto-follow
streamDiv.addEventListener('scroll', ()=>{
  const distanceFromBottom = streamDiv.scrollHeight - (streamDiv.scrollTop + streamDiv.clientHeight);
  if(distanceFromBottom>140){ if(autoFollow){ autoFollow=false; followBtn.style.display='inline-block'; followBtn.classList.add('attention'); } }
  else { if(!autoFollow){ autoFollow=true; followBtn.style.display='none'; followBtn.classList.remove('attention'); } }
});

followBtn.addEventListener('click', ()=>{ autoFollow=true; followBtn.style.display='none'; followBtn.classList.remove('attention'); scrollToBottom(); });

async function fetchChatState(force=false){
  if(chatPolling) return; const now=Date.now(); if(!force && now - lastChatRefresh < 2500) return;
  chatPolling=true;
  try {
    const res = await fetch('/chat/state'); if(!res.ok) throw new Error('chat_state_error');
    const data = await res.json();
    chatStateCache = data;
    renderChat();
  } catch(e){ /* silencioso */ }
  finally { lastChatRefresh = Date.now(); chatPolling=false; }
}

function renderChat(){
  // Answers (mostrar mais recentes primeiro limit 50)
  // Filtrar: não mostrar respostas que sejam 'pause' ou 'end_topic' (essas vão só ao stream). Broadcast permanece opcional (mostrar). Chat_now e broadcast ficam.
  const rawAnswers = chatStateCache.answers||[];
  const answers = rawAnswers.filter(a=> a.mode==='chat_now' || a.mode==='broadcast' || a.placeholder).slice(-50).reverse();
  answersDiv.innerHTML='';
  for(const a of answers){
    const div = document.createElement('div');
  let routeClass = '';
  if(a.mode==='chat_now') routeClass=' route-CHAT_NOW'; else if(a.mode==='pause') routeClass=' route-PAUSE'; else if(a.mode==='end_topic') routeClass=' route-END_TOPIC';
  div.className = 'answer '+a.mode + routeClass + (a.__new ? ' new':'') + (a.placeholder ? ' placeholder':'');
  const modeLabel = a.placeholder ? 'AGENDADA' : (a.mode==='chat_now' ? 'IMEDIATA' : a.mode==='broadcast' ? 'BROADCAST' : a.mode);
    const meta = document.createElement('div'); meta.className='meta'; meta.textContent = modeLabel + ' • ' + new Date(a.ts).toLocaleTimeString();
    const body = document.createElement('div'); body.textContent = a.answer;
  div.appendChild(meta); div.appendChild(body); answersDiv.appendChild(div);
  if(a.mode==='chat_now' && avatarPlayer){ avatarPlayer.enqueueAnswer(a); }
  if(a.__new){ setTimeout(()=>{ div.classList.remove('new'); delete a.__new; },2500); }
  }
  // Group pending questions by route for clarity
  listNow.innerHTML=''; listPause.innerHTML=''; listEnd.innerHTML=''; listFinal.innerHTML=''; listNotes.innerHTML='';
  const allPending = (chatStateCache.questionsQueue||[]);
  // Futuro: incorporar finalQueue e presenterNotes painéis
  const groupPause = []; const groupEnd = []; const groupNow = [];
  for(const q of allPending){
    if(q.route==='PAUSE') groupPause.push(q); else if(q.route==='END_TOPIC') groupEnd.push(q); else groupNow.push(q);
  }
  const finalQueue = chatStateCache.finalQueue||[];
  const presenterNotes = chatStateCache.presenterNotes||[];
  countPause.textContent = groupPause.length ? '('+groupPause.length+')' : '';
  countEnd.textContent = groupEnd.length ? '('+groupEnd.length+')' : '';
  countFinal.textContent = finalQueue.length ? '('+finalQueue.length+')' : '';
  countNotes.textContent = presenterNotes.length ? '('+presenterNotes.length+')' : '';
  function addItem(target, q){
    const li = document.createElement('li');
    if(q.route==='PAUSE') li.classList.add('waiting-pause');
    if(q.route==='END_TOPIC') li.classList.add('waiting-end');
    const top = document.createElement('div');
    const routeTag = document.createElement('span'); routeTag.className='tag route-'+(q.route||'UNK'); routeTag.textContent=q.route||'PEND'; top.appendChild(routeTag);
    const textSpan = document.createElement('span'); textSpan.textContent = q.text.slice(0,140); top.appendChild(textSpan);
    // Ações
    const actions = document.createElement('div'); actions.style.marginTop='4px'; actions.style.display='flex'; actions.style.flexWrap='wrap'; actions.style.gap='4px';
    const buttons = [
      ['IGNORE','🚫'],['CHAT_NOW','💬'],['PAUSE','⏸️'],['END_TOPIC','🔚'],['NOTE','📝'],['FINAL','🏁']
    ];
    for(const [act,label] of buttons){
      const b=document.createElement('button'); b.type='button'; b.textContent=label; b.title=act; b.style.fontSize='10px'; b.style.padding='2px 6px'; b.style.background='#1e293b'; b.style.border='1px solid #334155'; b.style.cursor='pointer';
      b.addEventListener('click', async ()=>{
        b.disabled=true;
        try {
          await fetch('/questions/'+q.id+'/action',{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action: act })});
          await fetchChatState(true);
        } finally { b.disabled=false; }
      });
      actions.appendChild(b);
    }
    li.appendChild(actions);
    li.appendChild(top);
    const meta = document.createElement('small');
    const baseTs = q.ts || Date.now();
    meta.textContent = new Date(baseTs).toLocaleTimeString();
    const elapsed = document.createElement('span'); elapsed.className='elapsed'; elapsed.dataset.baseTs = baseTs; li.appendChild(meta); li.appendChild(elapsed);
    target.appendChild(li);
  }
  groupNow.forEach(q=>addItem(listNow,q));
  groupPause.forEach(q=>addItem(listPause,q));
  groupEnd.forEach(q=>addItem(listEnd,q));
  // Final queue (somente leitura)
  for(const f of finalQueue){
    const li=document.createElement('li');
    const tag=document.createElement('span'); tag.className='tag route-FINAL'; tag.textContent='FINAL'; li.appendChild(tag);
    const span=document.createElement('span'); span.textContent=f.text.slice(0,160); li.appendChild(span);
    const meta=document.createElement('small'); meta.textContent=new Date(f.ts||Date.now()).toLocaleTimeString(); li.appendChild(meta);
    listFinal.appendChild(li);
  }
  // Notes
  for(const n of presenterNotes){
    const li=document.createElement('li');
    const tag=document.createElement('span'); tag.className='tag route-NOTE'; tag.textContent='NOTE'; li.appendChild(tag);
    const span=document.createElement('span'); span.textContent=n.text.slice(0,160); li.appendChild(span);
    const meta=document.createElement('small'); meta.textContent=new Date(n.ts||Date.now()).toLocaleTimeString(); li.appendChild(meta);
    listNotes.appendChild(li);
  }
  updateElapsed();
  // Immediate filter
  if(hideImmediateChk?.checked){ answersDiv.parentElement?.classList.add('hiddenImmediate'); } else { answersDiv.parentElement?.classList.remove('hiddenImmediate'); }
}

// (Removido: antiga lógica custom de sse-insert)

chatForm?.addEventListener('submit', async (e)=>{
  e.preventDefault(); const text = chatInput.value.trim(); if(!text) return; chatInput.disabled=true;
  try {
    const res = await fetch('/chat/send',{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ text })});
    if(res.ok){
      const data = await res.json();
      chatInput.value='';
      // Renderização otimista de resposta IMEDIATA
      if(data.route==='CHAT_NOW' && data.answer){
        const answers = chatStateCache.answers || [];
        answers.push({ ...data.answer, __new:true });
        chatStateCache.answers = answers;
        renderChat();
      } else {
        // Mesmo não imediato, tentar atualizar estado (podem ter sido processados outros CHAT_NOW fallback)
        await fetchChatState(true);
      }
    }
  } catch(e){ /* ignore */ }
  finally { chatInput.disabled=false; chatInput.focus(); }
});

chatInput?.addEventListener('keydown', e => {
  if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); chatForm?.dispatchEvent(new Event('submit')); }
});


setInterval(()=>fetchChatState(false), 3000);
fetchChatState(true);

// Controls wiring
refreshBtn?.addEventListener('click', ()=>fetchChatState(true));
hideImmediateChk?.addEventListener('change', ()=>renderChat());

// Collapse groups logic
const groupStates = { now:true, pause:true, end:true, final:true, notes:true };
function applyGroupState(){
  for(const k of Object.keys(groupStates)){
    const el = document.querySelector('.pending-group[data-group="'+k+'"]');
    if(el){ if(groupStates[k]) el.classList.remove('collapsed'); else el.classList.add('collapsed'); }
  }
}
document.querySelectorAll('[data-group-toggle]')?.forEach(h=>{
  h.addEventListener('click', ()=>{ const g = h.getAttribute('data-group-toggle'); groupStates[g]=!groupStates[g]; applyGroupState(); });
});
toggleAllBtn?.addEventListener('click', ()=>{
  const anyOpen = Object.values(groupStates).some(v=>v===true);
  for(const k of Object.keys(groupStates)) groupStates[k] = !anyOpen; applyGroupState();
});
applyGroupState();

// (Removido bootstrap antigo: agora feito via AvatarController durante initCourse)

avatarToggle?.addEventListener('click', ()=>{ avatarEnabled = !avatarEnabled; avatarToggle.textContent = avatarEnabled ? '🗣️' : '🙊'; avatarPlayer?.setMuted(!avatarEnabled); });
avatarMute?.addEventListener('click', ()=>{ if(!avatarPlayer) return; avatarPlayer.setMuted(!avatarPlayer.muted); avatarMute.textContent = avatarPlayer.muted ? '🔈' : '🔇'; });

// Elapsed timers update
function updateElapsed(){
  const nodes = document.querySelectorAll('.elapsed');
  const now = Date.now();
  nodes.forEach(n=>{
    const base = parseInt(n.dataset.baseTs,10)||now;
    const secs = Math.max(0, Math.floor((now-base)/1000));
    let label;
    if(secs<60) label = secs+'s'; else { const m=Math.floor(secs/60); const s=secs%60; label=m+'m'+(s?(''+s+'s'):''); }
    n.textContent='+'+label;
  });
}
setInterval(updateElapsed, 4000);
