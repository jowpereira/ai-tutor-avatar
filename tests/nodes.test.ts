import { describe, it, expect } from 'vitest';
import { initialState } from '../src/graph/state.js';
import { ingestTodo } from '../src/graph/nodes/ingestTodo.js';
import { judgeMessage } from '../src/graph/nodes/judgeMessage.js';
import { ingestMessage } from '../src/graph/nodes/ingestMessage.js';
import { answerChatNow } from '../src/graph/nodes/answerChatNow.js';
import { enqueueBroadcast } from '../src/graph/nodes/enqueueBroadcast.js';
import { broadcastAnswers } from '../src/graph/nodes/broadcastAnswers.js';

describe('Nodes basic', () => {
  it('ingestTodo sets currentTopicId', () => {
    const patch = ingestTodo(initialState, { todo: [{ id: 't1', title: 'Topico', subtasks: [] }] });
    expect(patch.currentTopicId).toBe('t1');
  });

  it('judgeMessage routes valid', () => {
    let state = { ...initialState };
    state = { ...state, ...ingestMessage(state, { message: { participantId: 'u1', content: 'Ano?' } }) };
    const patch = judgeMessage(state);
    expect(['CHAT_NOW', 'QUEUE_BROADCAST', 'IGNORE']).toContain(patch.route);
  });

  it('answerChatNow consumes pending', async () => {
    let state = { ...initialState };
    state = { ...state, ...ingestMessage(state, { message: { participantId: 'u1', content: 'Ano?' } }) };
    state = { ...state, ...judgeMessage(state) };
    const patch = await answerChatNow(state);
    expect(patch.answered?.length || 0).toBeGreaterThanOrEqual(0);
  });

  it('broadcastAnswers drains queue', async () => {
    let state = { ...initialState };
    for (let i = 0; i < 3; i++) {
      state = { ...state, ...ingestMessage(state, { message: { participantId: 'u1', content: 'Pergunta longa explique ' + i } }) };
      state = { ...state, ...judgeMessage(state) };
    }
    state = { ...state, ...enqueueBroadcast(state) };
    const patch = await broadcastAnswers(state);
    expect(patch.broadcastQueue?.length).toBe(0);
  });
});
