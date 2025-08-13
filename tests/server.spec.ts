import { describe, it, expect } from 'vitest';
import { createApp } from '../src/server/app.js';

describe('HTTP Server basic endpoints', () => {
  it('GET /health returns ok', async () => {
    const app = await createApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    await app.close();
  });

  it('POST /events with message triggers graph', async () => {
    const app = await createApp();
    const res = await app.inject({
      method: 'POST',
      url: '/events',
      payload: { type: 'message', message: 'hello' }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.result.message).toContain('Final:');
    await app.close();
  });

  it('POST /events unknown type returns 400', async () => {
    const app = await createApp();
    const res = await app.inject({
      method: 'POST',
      url: '/events',
      payload: { type: 'other' }
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
