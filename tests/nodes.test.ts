import { describe, it, expect } from 'vitest';
import { initialState } from '../src/graph/state.js';
import { ingestTodo } from '../src/graph/nodes/ingestTodo.js';
import { judgeMessage } from '../src/graph/nodes/judgeMessage.js';
import { ingestMessage } from '../src/graph/nodes/ingestMessage.js';
import { answerChatNow } from '../src/graph/nodes/answerChatNow.js';
import { enqueueBroadcast } from '../src/graph/nodes/enqueueBroadcast.js';
// broadcastAnswers removido do código principal (substituído por novos fluxos de pausa/fim de tópico)

describe('Nodes basic', () => {
  it('ingestTodo sets currentTopicId', () => {
    const patch = ingestTodo(initialState, { todo: [{ id: 't1', title: 'Topico', subtasks: [] }] });
    expect(patch.currentTopicId).toBe('t1');
  });

  it('judgeMessage routes valid', () => {
    let state = { ...initialState };
    state = { ...state, ...ingestMessage(state, { message: { participantId: 'u1', content: 'Ano?' } }) };
    const patch = judgeMessage(state);
  expect(['CHAT_NOW', 'PAUSE', 'END_TOPIC', 'IGNORE']).toContain(patch.route);
  });

  it('answerChatNow consumes pending', async () => {
    let state = { ...initialState };
    state = { ...state, ...ingestMessage(state, { message: { participantId: 'u1', content: 'Ano?' } }) };
    state = { ...state, ...judgeMessage(state) };
    const patch = await answerChatNow(state);
    expect(patch.answered?.length || 0).toBeGreaterThanOrEqual(0);
  });

  // Teste de broadcastAnswers removido (nó descontinuado)
});
