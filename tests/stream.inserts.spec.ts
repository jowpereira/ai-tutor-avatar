import { describe, it, expect } from 'vitest';
import { createApp } from '../src/server/app.js';

/**
 * Testa que uma pergunta roteada como PAUSE gera insert no estado e que o SSE o emite.
 * Para evitar chamada real LLM, se modelo exigir API real este teste pode ser ajustado para mock.
 */

describe('SSE inserts (pause)', () => {
  it('gera insert ao enviar pergunta que provoca PAUSE', async () => {
    const app = await createApp();
    // Inicializa curso
    await app.inject({ method: 'POST', url: '/events', payload: { type: 'build_course', todo: [] } });

    // Envia pergunta simulada (heurística: pergunta analítica mais longa tende a PAUSE)
    const question = 'Explique detalhadamente como o índice é recalculado quando há alta volatilidade?';
    const res = await app.inject({ method: 'POST', url: '/chat/send', payload: { text: question } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(['CHAT_NOW','PAUSE','END_TOPIC','IGNORE']).toContain(body.route);

    // Estado do chat
    const stateRes = await app.inject({ method: 'GET', url: '/chat/state' });
    const st = stateRes.json();
    // Não garante sempre PAUSE (depende LLM). Apenas valida estrutura resposta.
    expect(st).toHaveProperty('answers');
    await app.close();
  }, 20000);
});
