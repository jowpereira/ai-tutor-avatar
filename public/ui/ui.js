// Estado global
let totalPlanned = 0, received = 0, completed = 0;
let source = null; // EventSource
let activeTyping = 0; // lições sendo digitadas no modo batch
let pendingDone = false;
let lessonQueue = []; // fila de lições no modo batch
let isTyping = false;
let logBuffer = [];
// (modo token removido)

// Elementos
const startBtn = document.getElementById('startBtn');
const streamBtn = document.getElementById('streamBtn');
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
const pendingList = document.getElementById('pendingList');
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
  const chars = [...content];
  let idx = 0;
  const interval = setInterval(()=>{
    if(idx < chars.length){
      const ch = chars[idx];
      if(ch === '\n') streamDiv.appendChild(document.createElement('br')); else {
        const s = document.createElement('span'); s.textContent = ch; streamDiv.appendChild(s);
      }
      idx++; scrollToBottom();
    } else {
      clearInterval(interval);
      if(references && references.length){
        const lower = content.toLowerCase();
        if(!lower.includes('referências:')){
          appendText('\n');
          const refSpan = document.createElement('div'); refSpan.className='citation'; refSpan.textContent='Referências: ' + references.join(' '); streamDiv.appendChild(refSpan);
        }
      }
      appendText('\n\n');
      completed++; updateBar(); activeTyping--; isTyping=false; finalizeIfReady();
      if(logBuffer.length){ for(const entry of logBuffer){ appendText(entry+'\n','citation'); } logBuffer=[]; }
      onDone();
    }
  }, typingDelay);
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

async function initCourse(){
  try {
  startBtn.disabled=true; streamBtn.disabled=true;
    statusEl.textContent='🔄 Inicializando...'; headerEl.textContent='🎯 Preparando curso...'; streamDiv.innerHTML='';
    totalPlanned=0; received=0; completed=0; pendingDone=false; activeTyping=0; lessonQueue=[]; updateBar();
    const res = await fetch('/events',{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({type:'build_course'})});
    if(!res.ok) throw new Error('Falha ao inicializar');
    const js = await res.json();
    totalPlanned = (js.result?.todo?.[0]?.subtasks?.length || 0) + (js.result?.todo?.slice(1)?.reduce((a,t)=>a+(t.subtasks?.length||0),0) || 0);
    statusEl.textContent='✅ Pronto para stream'; headerEl.textContent='📋 Curso carregado ('+totalPlanned+' lições)';
  streamBtn.disabled=false; appendText('🎓 Sistema pronto! Total de '+totalPlanned+' lições.\n\n');
  } catch(e){
    statusEl.textContent='❌ Erro ao iniciar'; headerEl.textContent='⚠️ Falha na preparação'; startBtn.disabled=false;
    appendText('\n❌ '+(e.message||e.toString()));
  }
}

function toggleStream(){
  // único modo ativo
  if(source){ source.close(); source=null; streamBtn.innerHTML='▶️ Stream'; statusEl.textContent='⏹️ Parado'; headerEl.textContent='⏸️ Stream pausado'; return; }
  streamBtn.innerHTML='⏹️ Parar'; statusEl.textContent='🔴 Streaming...'; headerEl.textContent='🤖 IA gerando conteúdo...'; appendText('🚀 Iniciando geração com IA...\n\n');
  source = new EventSource('/course/stream');
  source.addEventListener('lesson', ev=>addLesson(JSON.parse(ev.data)));
  source.addEventListener('log', ev=>{ const data=JSON.parse(ev.data); if(isTyping){ logBuffer.push('ℹ️ '+data.msg); } else { appendText('ℹ️ '+data.msg+'\n','citation'); } });
  source.addEventListener('done', ()=>{ pendingDone=true; finalizeIfReady(); });
  source.onerror = ()=>{ statusEl.textContent='❌ Erro'; streamBtn.innerHTML='▶️ Stream'; streamBtn.disabled=false; headerEl.textContent='⚠️ Conexão perdida'; if(source){source.close(); source=null;} appendText('\n❌ Erro na conexão. Tente novamente.'); };
}

startBtn.addEventListener('click', initCourse);
streamBtn.addEventListener('click', toggleStream);

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
  const answers = [...(chatStateCache.answers||[])].slice(-50).reverse();
  answersDiv.innerHTML='';
  for(const a of answers){
    const div = document.createElement('div');
    div.className = 'answer '+a.mode;
  const modeLabel = a.mode==='chat_now' ? 'AGORA' : a.mode==='pause' ? 'PAUSA' : a.mode==='end_topic' ? 'FIM TÓPICO' : a.mode;
  const meta = document.createElement('div'); meta.className='meta'; meta.textContent = modeLabel + ' • ' + new Date(a.ts).toLocaleTimeString();
    const body = document.createElement('div'); body.textContent = a.answer;
    div.appendChild(meta); div.appendChild(body); answersDiv.appendChild(div);
  }
  // Pendentes
  pendingList.innerHTML='';
  const allPending = (chatStateCache.questionsQueue||[]);
  for(const q of allPending){
    const li = document.createElement('li');
    const top = document.createElement('div');
  const routeTag = document.createElement('span'); routeTag.className='tag route-'+(q.route||'UNK'); routeTag.textContent=q.route||'PEND';
    top.appendChild(routeTag);
    const textSpan = document.createElement('span'); textSpan.textContent = q.text.slice(0,140); top.appendChild(textSpan);
    li.appendChild(top);
    const meta = document.createElement('small'); meta.textContent = new Date(q.ts||Date.now()).toLocaleTimeString(); li.appendChild(meta);
    pendingList.appendChild(li);
  }
}

chatForm?.addEventListener('submit', async (e)=>{
  e.preventDefault(); const text = chatInput.value.trim(); if(!text) return; chatInput.disabled=true;
  try {
    const res = await fetch('/chat/send',{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ text })});
    if(res.ok){ chatInput.value=''; await fetchChatState(true); }
  } catch(e){ /* ignore */ }
  finally { chatInput.disabled=false; chatInput.focus(); }
});

chatInput?.addEventListener('keydown', e => {
  if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); chatForm?.dispatchEvent(new Event('submit')); }
});


setInterval(()=>fetchChatState(false), 3000);
fetchChatState(true);
