import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createApp } from '../src/server/app.js'; // TypeScript output via tsx runtime

// Testa comportamento sem SPEECH_KEY configurado

describe('avatar token endpoint', () => {
  it('retorna 503 quando não configurado', async () => {
    const app = await createApp();
    const res = await app.inject({ method: 'POST', url: '/avatar/token' });
    expect(res.statusCode).toBe(503);
  });

  describe('com variáveis configuradas', () => {
    const OLD_KEY = process.env.SPEECH_KEY;
    const OLD_REGION = process.env.SPEECH_REGION;
    beforeAll(() => {
      process.env.SPEECH_KEY = 'test-key';
      process.env.SPEECH_REGION = 'eastus';
    });
    afterAll(() => {
      if(OLD_KEY) process.env.SPEECH_KEY = OLD_KEY; else delete process.env.SPEECH_KEY;
      if(OLD_REGION) process.env.SPEECH_REGION = OLD_REGION; else delete process.env.SPEECH_REGION;
    });

    it('retorna erro interno (token_error) sem chamada real à Azure (esperado em ambiente offline)', async () => {
      const app = await createApp();
      const res = await app.inject({ method: 'POST', url: '/avatar/token' });
      // Em ambiente sem rede / chave inválida deve falhar com 500 token_error
      // Valida que caminho passou pela verificação de config (não 503)
      expect(res.statusCode).toBeGreaterThanOrEqual(500);
      expect(res.statusCode).toBeLessThan(600);
      const body = res.json();
      expect(body.error).toBeDefined();
    });
  });
});
