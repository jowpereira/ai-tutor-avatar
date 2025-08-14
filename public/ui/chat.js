import { store, derive } from './store.js';
import { sendQuestion, actOnQuestion } from './api.js';

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  initChat();
});

function initChat() {
  const form = document.getElementById('chatForm');
  const input = document.getElementById('chatInput');
  const sendBtn = document.getElementById('sendChat');
  const pendingList = document.getElementById('pendingList');
  const answersDiv = document.getElementById('answers');

  console.log('Chat elements found:', { form, input, sendBtn, pendingList, answersDiv });

  function renderPending(list){
    if (!pendingList) return;
    pendingList.innerHTML='';
    for(const q of list){
      const li = document.createElement('li');
      li.className = `question-item status-${q.status || 'pending'}`;
      
      const qText = document.createElement('span');
      qText.className = 'question-text';
      qText.textContent = q.text + (q.optimisticAction ? ` [${q.optimisticAction}...]`: '');
      li.appendChild(qText);
      
      const actions = document.createElement('div'); 
      actions.className='q-actions';
      
      // 5 ações com ícones e labels mais claros
      const actionButtons = [
        { action: 'IGNORE', icon: '🚫', label: 'Ignorar', title: 'Marcar como irrelevante' },
        { action: 'ANSWER_NOW', icon: '💬', label: 'Responder', title: 'Responder agora no chat' },
        { action: 'PAUSE', icon: '⏸️', label: 'Pausar', title: 'Criar ponto de pausa' },
        { action: 'NOTE', icon: '📝', label: 'Nota', title: 'Adicionar nota para apresentador' },
        { action: 'FINAL_QA', icon: '🔚', label: 'Final', title: 'Encaminhar para Q&A final' }
      ];
      
      actionButtons.forEach(({ action, icon, label, title }) => {
        const btn = document.createElement('button'); 
        btn.type = 'button'; 
        btn.className = `action-btn action-${action.toLowerCase()}`;
        btn.innerHTML = `${icon} <span class="btn-label">${label}</span>`;
        btn.title = title;
        btn.onclick = () => actOnQuestion(q.id, action);
        btn.disabled = !!q.optimisticAction;
        actions.appendChild(btn);
      });
      
      li.appendChild(actions);
      pendingList.appendChild(li);
    }
  }

  function renderAnswers(list){
    if (!answersDiv) return;
    answersDiv.innerHTML='';
    for(const a of list.slice(-50)){
      const div=document.createElement('div'); div.className='answer';
      div.textContent = a.answer;
      answersDiv.appendChild(div);
    }
  }

  derive(s=>s.questionsQueue, qs=>renderPending(qs));

  derive(s=>s.answers, a=>renderAnswers(a));

  // Integração com o logger estruturado do ui.js
  const logEvent = (level, event, metadata) => {
    if (typeof FrontendLogger !== 'undefined') {
      FrontendLogger.logEvent(level, event, metadata);
    } else {
      console[level](`[${level.toUpperCase()}] ${event}`, metadata);
    }
  };

  // Função para enviar pergunta
  async function handleSendQuestion() {
    if (!input) return;
    
    const text = input.value.trim(); 
    if (!text) return;
    
    input.value = '';
    
    logEvent('info', 'user_question_input', { questionLength: text.length });
    try { 
      await sendQuestion(text);
      logEvent('info', 'question_sent_success', { questionLength: text.length });
    } catch(e){ 
      logEvent('error', 'send_question_error', { 
        error: e.message,
        questionLength: text.length 
      }); 
    }
  }

  // Event listeners para form submit
  if (form) {
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      await handleSendQuestion();
    });
  }

  // Event listener para botão enviar  
  if (sendBtn) {
    sendBtn.addEventListener('click', async (ev) => {
      ev.preventDefault();
      await handleSendQuestion();
    });
  }

  // Event listener para Enter no textarea
  if (input) {
    input.addEventListener('keypress', async (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        await handleSendQuestion();
      }
    });
  }

  // SSE answer integration - listen to existing stream instead of duplicating
  (function initSSE(){
    // Wait for stream to be opened by ui.js, then listen to custom events
    window.addEventListener('sse-answer', ev => {
      try { 
        store.pushAnswer(ev.detail);
        logEvent('info', 'answer_received', { 
          answerId: ev.detail.id,
          answerLength: ev.detail.content?.length || 0
        });
      } catch(e) { 
        logEvent('warn', 'bad_answer_event', { 
          error: e.message,
          eventDetail: ev.detail 
        });
      }
    });
  })();
}
