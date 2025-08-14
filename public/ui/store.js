// Simple reactive store for chat/course state
export const store = {
  state: {
    sessionId: null,
    traceId: null,
    lessons: [],
    answers: [],
    questionsQueue: [],
    broadcastQueue: [],
    logs: []
  },
  listeners: new Set(),
  set(patch) {
    Object.assign(this.state, patch);
    for (const l of this.listeners) l(this.state, patch);
  },
  pushAnswer(ans) {
    this.state.answers.push(ans);
    this.set({ answers: this.state.answers });
  },
  pushQuestion(q) {
    this.state.questionsQueue.push(q);
    this.set({ questionsQueue: this.state.questionsQueue });
  },
  updateQuestion(qid, patch) {
    const q = this.state.questionsQueue.find(q=>q.id===qid); if(!q) return;
    Object.assign(q, patch); this.set({ questionsQueue: this.state.questionsQueue });
  },
  subscribe(fn){ this.listeners.add(fn); return ()=>this.listeners.delete(fn); }
};

export function derive(selector, cb){
  let prev;
  return store.subscribe(state => {
    const sel = selector(state);
    if (sel !== prev) { prev = sel; cb(sel, state); }
  });
}
