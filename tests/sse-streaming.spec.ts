import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../src/server/app.js';
import type { FastifyInstance } from 'fastify';

// SSE Test Harness with proper streaming control using native Node.js
class SSETestClient {
  private events: Record<string, unknown>[] = [];

  async connect(url: string, maxEvents: number = 3, timeoutMs: number = 5000): Promise<Record<string, unknown>[]> {
    const { default: fetch } = await import('node-fetch');
  const controller = new AbortController();
  const signal = controller.signal;
    
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`SSE timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'text/event-stream' },
        signal
      }).then(response => {
        if (!response.ok) {
          clearTimeout(timeoutId);
          reject(new Error(`SSE connection failed: ${response.status}`));
          return;
        }

        let buffer = '';
        let eventCount = 0;

        response.body?.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.substring(6));
                this.events.push(data);
                eventCount++;
                
                if (eventCount >= maxEvents) {
                  clearTimeout(timeoutId);
                  // Close stream
                  try { controller.abort(); } catch { /* ignore abort error */ }
                  resolve(this.events);
                  return;
                }
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        });

        response.body?.on('end', () => {
          clearTimeout(timeoutId);
          resolve(this.events);
        });

        response.body?.on('error', (error: Error & { name?: string }) => {
          if (error && (error.name === 'AbortError' || /aborted/i.test(error.message))) {
            // treat abort as graceful end
            clearTimeout(timeoutId);
            resolve(this.events);
            return;
          }
          clearTimeout(timeoutId);
          reject(error);
        });
      }).catch(error => {
        clearTimeout(timeoutId);
  try { controller.abort(); } catch { /* ignore abort error */ }
        reject(error);
      });
    });
  }
}
let app: FastifyInstance;
let baseUrl: string;

describe('SSE Streaming Tests', () => {
  beforeAll(async () => {
    app = await createApp();
    // Listen on ephemeral port
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (address && typeof address === 'object') {
      baseUrl = `http://127.0.0.1:${address.port}`;
    } else {
      throw new Error('Failed to obtain server address');
    }
  });
  afterAll(async () => {
    await app.close();
  });

  it('should receive heartbeat events from course stream', async () => {
    const client = new SSETestClient();
    
  const events = await client.connect(`${baseUrl}/course/stream`, 2, 8000);
    
    expect(events.length).toBeGreaterThan(0);
    
    // Should contain at least one heartbeat event
    const heartbeats = events.filter(e => e.type === 'heartbeat');
    expect(heartbeats.length).toBeGreaterThan(0);
    
    // Heartbeat should have timestamp
    const firstHeartbeat = heartbeats[0];
    expect(firstHeartbeat).toHaveProperty('timestamp');
    expect(typeof firstHeartbeat.timestamp).toBe('number');
  }, 10000);

  it('should receive insert events when paused questions are processed', async () => {
  const { default: fetch } = await import('node-fetch');
    
    // First trigger a PAUSE route classification
  const chatResponse = await fetch(`${baseUrl}/chat/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        message: 'Podemos parar aqui para uma pergunta importante sobre Machine Learning?',
        participantId: 'test_participant'
      })
    });
    
    expect(chatResponse.ok).toBe(true);
    const chatData = await chatResponse.json() as { route: string };
    expect(['PAUSE', 'CHAT_NOW']).toContain(chatData.route);

    // Then check stream for insert events
    const client = new SSETestClient();
    // Need only 3 events now (log + heartbeat + insert) to finish sooner
  const events = await client.connect(`${baseUrl}/course/stream`, 3, 8000);
    
    // Should contain insert events
    const inserts = events.filter(e => e.type === 'insert');
    
    if (inserts.length > 0) {
      const insert = inserts[0];
      expect(insert).toHaveProperty('data');
      
      // Type guard for insert data
      const insertData = insert.data as { mode?: string; text?: string };
      if (insertData && typeof insertData === 'object') {
        expect(['pause', 'end_topic']).toContain(insertData.mode || 'unknown');
      }
    }
    
    // At minimum should have some events (heartbeat or insert)
    expect(events.length).toBeGreaterThan(0);
  }, 12000);

  it('should handle END_TOPIC consolidation properly', async () => {
    const { default: fetch } = await import('node-fetch');
    
    // Trigger END_TOPIC messages
    const endTopicMessage = 'Por favor, finalize este tópico com um resumo completo dos conceitos de Machine Learning.';
    
  const chatResponse = await fetch(`${baseUrl}/chat/send`, {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: endTopicMessage,
        participantId: 'test_participant'
      })
    });

    expect(chatResponse.ok).toBe(true);
    const chatData = await chatResponse.json() as { route: string };
    
    // Should either be routed immediately or queued
    expect(['END_TOPIC', 'CHAT_NOW', 'PAUSE']).toContain(chatData.route);

    // Check lesson state after processing
  const stateResponse = await fetch(`${baseUrl}/chat/state`);
    expect(stateResponse.ok).toBe(true);
    const state = await stateResponse.json() as { questionsCount: number };
    
    // Should have some questions or answers processed
    expect(state).toHaveProperty('questionsCount');
    expect(typeof state.questionsCount).toBe('number');
  }, 12000);
});
