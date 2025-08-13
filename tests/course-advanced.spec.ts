import { describe, it, expect } from 'vitest';
import { createApp } from '../src/server/app.js';
import { promises as fs } from 'fs';
import path from 'path';

// Advanced flow: auto next + refine + citation normalization

describe('Course advanced generation flow', () => {
  it('auto generates multiple lessons and refines one with normalized citations', async () => {
    const app = await createApp();
    const todosRaw = await fs.readFile(path.resolve(process.cwd(), 'data', 'training', 'todos', 'todos.json'), 'utf-8');
    const todos = JSON.parse(todosRaw).slice(0,2); // take two topics to exercise transitions

    // init course
    const initRes = await app.inject({ method: 'POST', url: '/events', payload: { type: 'build_course', todo: todos } });
    expect(initRes.statusCode).toBe(200);

    // auto iterate
    const nextRes = await app.inject({ method: 'POST', url: '/course/next', payload: { auto: true, maxSteps: 40 } });
    expect(nextRes.statusCode).toBe(200);
    const state = nextRes.json().state;
    expect(state.lessons.length).toBeGreaterThan(0);

    // fetch lessons
    const lessonsRes = await app.inject({ method: 'GET', url: '/course/lessons' });
    expect(lessonsRes.statusCode).toBe(200);
    const lessonsBody = lessonsRes.json();
    const lessonWithContent = lessonsBody.lessons.find((l: any) => (l.content || l.grounded || l.draft));
    expect(lessonWithContent).toBeTruthy();

    // citations normalized (unique)
    if (lessonWithContent?.citations) {
      const cits: string[] = lessonWithContent.citations;
      const uniq = Array.from(new Set(cits));
      expect(uniq.length).toBe(cits.length);
      cits.forEach(c => expect(c).toMatch(/\[\[ref:[^\]]+\]\]/));
    }

    // refine first lesson
    const target = lessonsBody.lessons[0];
    const refineRes = await app.inject({ method: 'POST', url: '/course/refine', payload: { lessonId: target.id, prompt: 'Aprofundar com foco em exemplos práticos' } });
    expect(refineRes.statusCode).toBe(200);
    const refineBody = refineRes.json();
    expect(refineBody.result.refined).toBe(true);
    expect(refineBody.result.content).toContain('[Refinamento]');

    await app.close();
  }, 30000);
});
