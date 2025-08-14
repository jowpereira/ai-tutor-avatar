import { describe, it, expect } from 'vitest';
import { createApp } from '../src/server/app.js';

describe('END_TOPIC enqueue', () => {
  it('aceita pergunta potencialmente roteada para END_TOPIC', async () => {
    const app = await createApp();
    await app.inject({ method: 'POST', url: '/events', payload: { type: 'build_course', todo: [] } });
    const q = 'Pode fazer um resumo final geral agora?';
    const res = await app.inject({ method: 'POST', url: '/chat/send', payload: { text: q } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(['CHAT_NOW','PAUSE','END_TOPIC','IGNORE']).toContain(body.route);
    await app.close();
  }, 20000);
});
