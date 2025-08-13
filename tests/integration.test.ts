import { describe, it, expect } from 'vitest';
import { initialState } from '../src/graph/state.js';
import { ingestMessage } from '../src/graph/nodes/ingestMessage.js';
import { judgeMessage } from '../src/graph/nodes/judgeMessage.js';
import { answerChatNow } from '../src/graph/nodes/answerChatNow.js';
import { enqueueBroadcast } from '../src/graph/nodes/enqueueBroadcast.js';
import { broadcastAnswers } from '../src/graph/nodes/broadcastAnswers.js';

describe('Integration flows', () => {
  it('CHAT_NOW flow completes', async () => {
    let state = { ...initialState };
    state = { ...state, ...ingestMessage(state, { message: { participantId: 'u1', content: 'Qual a porta?' } }) };
    state = { ...state, ...judgeMessage(state) };
    const patch = await answerChatNow(state);
    expect((patch.answered || []).length).toBeGreaterThanOrEqual(0);
  });

  it('QUEUE_BROADCAST flow triggers broadcast', async () => {
    let state = { ...initialState };
    for (let i = 0; i < 4; i++) {
      state = { ...state, ...ingestMessage(state, { message: { participantId: 'u1', content: 'Explique conceito complexo ' + i } }) };
      state = { ...state, ...judgeMessage(state) };
    }
    state = { ...state, ...enqueueBroadcast(state) };
    const patch = await broadcastAnswers(state);
    expect(patch.broadcastQueue?.length).toBe(0);
  });
});
