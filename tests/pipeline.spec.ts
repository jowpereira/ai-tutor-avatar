import { describe, it, expect } from 'vitest';
import { createApp } from '../src/server/app.js';

describe('Full training pipeline integration', () => {
  it('processes message through ingest->judge->finalize pipeline', async () => {
    const app = await createApp();
    
    // Send a complex question that should trigger QUEUE_BROADCAST route
    const res = await app.inject({
      method: 'POST',
      url: '/events',
      payload: { type: 'message', message: 'Explique em detalhes como funciona machine learning' }
    });
    
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    
    // Validate pipeline state progression
    const result = body.result;
    expect(result.route).toBe('QUEUE_BROADCAST'); // Judge should classify as complex
    expect(result.questionsQueue).toHaveLength(0); // Question should be moved out
    expect(result.broadcastQueue).toHaveLength(1); // Should be enqueued for broadcast
    expect(result.participants).toContain('default');
    expect(result.logs).toHaveLength(3); // ingest + judge + finalize
    expect(result.message).toContain('Final:');
    
    await app.close();
  });

  it('processes simple question with RAG flag', async () => {
    const app = await createApp();
    
    // Send factual question that should trigger CHAT_NOW with RAG
    const res = await app.inject({
      method: 'POST',
      url: '/events',
      payload: { type: 'message', message: 'Qual o ano do Brasil independente?' }
    });
    
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    
    const result = body.result;
    expect(result.route).toBe('CHAT_NOW');
    expect(result.pendingQuestions).toHaveLength(1);
    expect(result.pendingQuestions[0].needsRAG).toBe(true); // Should be flagged for RAG
    expect(result.questionsQueue).toHaveLength(0);
    
    await app.close();
  });

  it('supports legacy todo format', async () => {
    const app = await createApp();
    
    const res = await app.inject({
      method: 'POST',
      url: '/events',
      payload: { type: 'todo', todo: 'Complete documentation' }
    });
    
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.result.message).toContain('Todo:');
    
    await app.close();
  });
});
