import { describe, it, expect } from 'vitest';
import { createApp } from '../src/server/app.js';
import { promises as fs } from 'fs';
import path from 'path';

describe('Course generation flow', () => {
  it('initializes and progresses lesson generation', async () => {
    const app = await createApp();
    const todosRaw = await fs.readFile(path.resolve(process.cwd(), 'data', 'training', 'todos', 'todos.json'), 'utf-8');
    const todos = JSON.parse(todosRaw).slice(0,1);

    const initRes = await app.inject({ method: 'POST', url: '/events', payload: { type: 'build_course', todo: todos } });
    expect(initRes.statusCode).toBe(200);

    // Advance a few steps
    for (let i=0;i<4;i++) {
      await app.inject({ method: 'POST', url: '/events', payload: { type: 'next_section' } });
    }

    const lessonsRes = await app.inject({ method: 'GET', url: '/course/lessons' });
    expect(lessonsRes.statusCode).toBe(200);
    const lessonsBody = lessonsRes.json();
    if (lessonsBody.lessons.length > 0) {
      const first = lessonsBody.lessons[0];
      expect(first.content || first.grounded || first.draft).toBeTruthy();
    }
    await app.close();
  }, 20000);
});
