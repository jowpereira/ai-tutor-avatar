import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { createApp } from '../src/server/app.js';

/**
 * Teste de heartbeat SSE aprimorado: verifica stream inicial e headers corretos.
 */

let app: FastifyInstance;
let baseUrl: string;

describe('SSE heartbeat', () => {
  beforeAll(async () => {
    app = await createApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    if (addr && typeof addr === 'object') baseUrl = `http://127.0.0.1:${addr.port}`;
    else throw new Error('no addr');
  });
  afterAll(async () => {
    try {
      await app.close();
    } catch {
      // ignore
    }
  }, 20000);

  it('should establish SSE connection and validate headers', async () => {
    const res = await fetch(`${baseUrl}/course/stream`, { headers: { Accept: 'text/event-stream' } });
    expect(res.ok).toBe(true);
    const ct = res.headers.get('content-type') || '';
    expect(ct).toContain('text/event-stream');
    // read a small chunk then abort
  // body is a ReadableStream in undici (Node fetch). Narrow type.
  const body = res.body as unknown as ReadableStream<Uint8Array> | null;
  if (!body) return;
  const reader = body.getReader();
    const timer = setTimeout(() => reader.cancel().catch(()=>{}), 3000);
  await reader.read().catch(()=>{});
  clearTimeout(timer);
  try { reader.cancel(); } catch { /* ignore */ }
  }, 15000);
});
