// Rotas propostas (-alterar) para um endpoint dedicado de curso.
// Não registradas ainda.
// Ideia:
//  POST /course/init { todos? }
//  POST /course/next { auto?: boolean }
//  POST /course/refine { lessonId, prompt }
//  GET  /course/state

import { FastifyInstance } from 'fastify';
import { lessonManagerAlterar } from './lessonManager-alterar.js';

export async function registerCourseRoutesAlterar(app: FastifyInstance) {
  app.post('/course/init', async (req, rep) => {
    // @ts-ignore
    const body = req.body || {};
    const state = await lessonManagerAlterar.init(body.todos || []);
    return rep.send({ ok: true, state });
  });

  app.post('/course/next', async (_req, rep) => {
    const state = await lessonManagerAlterar.stepUntilNewSection();
    return rep.send({ ok: true, state });
  });

  app.post('/course/refine', async (req, rep) => {
    // @ts-ignore
    const { lessonId, prompt } = req.body || {};
    const result = await lessonManagerAlterar.refine(lessonId, prompt || '');
    return rep.send({ ok: true, result });
  });

  app.get('/course/state', async (_req, rep) => {
    return rep.send({ ok: true, state: lessonManagerAlterar.getState() });
  });
}
