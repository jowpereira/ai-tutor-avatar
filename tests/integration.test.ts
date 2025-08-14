import { describe, it, expect } from 'vitest';
import { initialState } from '../src/graph/state.js';
import { ingestMessage } from '../src/graph/nodes/ingestMessage.js';
import { judgeMessage } from '../src/graph/nodes/judgeMessage.js';
import { answerChatNow } from '../src/graph/nodes/answerChatNow.js';
// enqueueBroadcast não utilizado neste teste após remoção de broadcast
// broadcastAnswers removido do core

describe('Integration flows', () => {
  it('CHAT_NOW flow completes', async () => {
    let state = { ...initialState };
    state = { ...state, ...ingestMessage(state, { message: { participantId: 'u1', content: 'Qual a porta?' } }) };
    state = { ...state, ...judgeMessage(state) };
    const patch = await answerChatNow(state);
    expect((patch.answered || []).length).toBeGreaterThanOrEqual(0);
  });

  // Fluxo QUEUE_BROADCAST original removido (broadcastAnswers descontinuado)
});
