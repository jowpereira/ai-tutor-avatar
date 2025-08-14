import { store } from './store.js';

async function jsonFetch(url, opts){
  const res = await fetch(url, { headers:{'Content-Type':'application/json'}, ...opts });
  if(!res.ok) throw new Error('HTTP '+res.status);
  return res.json();
}

export async function sendQuestion(text){
  const qTemp = { id:'temp_'+Date.now(), text, status:'SENDING' };
  store.pushQuestion(qTemp);
  try {
    const r = await jsonFetch('/sessions/current/questions',{ method:'POST', body: JSON.stringify({ text }) });
    store.updateQuestion(qTemp.id, { replacedBy: r.question.id });
    store.state.questionsQueue = store.state.questionsQueue.filter(q=>q.id!==qTemp.id);
    store.pushQuestion(r.question);
    return r.question;
  } catch(e){
    store.updateQuestion(qTemp.id, { status:'ERROR', error:e.message });
    throw e;
  }
}

export async function actOnQuestion(qid, action){
  const q = store.state.questionsQueue.find(q=>q.id===qid);
  if(q) store.updateQuestion(qid, { optimisticAction: action });
  try {
    const r = await jsonFetch(`/sessions/current/questions/${qid}/action`, { method:'POST', body: JSON.stringify({ action }) });
    if(r.answer) store.pushAnswer(r.answer);
    store.updateQuestion(qid, { status: r.question.status, action: r.question.action, optimisticAction:null });
  } catch(e){
    store.updateQuestion(qid, { optimisticAction:null, error:e.message });
  }
}
