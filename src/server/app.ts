import Fastify, { FastifyInstance } from 'fastify';
import { loadEnv } from '../config/env.js';
import { buildGraph } from '../graph/app.js';
import { registerRoutes } from './routes.js';
import { logger } from '../utils/observability.js';

// Factory to create a Fastify app with routes & graph wired (no listen) for tests or external usage
export async function createApp(): Promise<FastifyInstance> {
  loadEnv();
  const app = Fastify({ logger: true });

  // Instrumentation hooks
  app.addHook('onRequest', async (req) => {
    logger.info({ event: 'request_start', method: req.method, url: req.url, id: req.id });
  });
  app.addHook('onResponse', async (req, res) => {
    logger.info({ event: 'request_end', method: req.method, url: req.url, status: res.statusCode, id: req.id });
  });
  app.addHook('onError', async (req, res, err) => {
    logger.error({ event: 'request_error', method: req.method, url: req.url, status: res.statusCode, message: err.message, stack: err.stack });
  });

  const graph = buildGraph();
  await registerRoutes(app, graph);
  return app;
}
