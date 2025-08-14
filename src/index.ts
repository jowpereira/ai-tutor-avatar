import { logger } from './utils/observability.js';
import { createApp } from './server/app.js';

async function main() {
  const app = await createApp();
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
  try {
    await app.listen({ port, host: '0.0.0.0' });
  logger.info({ event: 'server_started', msg: 'Server running', port, host: '0.0.0.0', isoTimestamp: new Date().toISOString(), note: 'Listening on all interfaces for accessibility' });

    const gracefulShutdown = (signal: string) => {
      logger.info({ event: 'server_shutdown_initiated', signal });
      app.close(() => {
        logger.info({ event: 'server_shutdown_complete' });
        process.exit(0);
      });
    };
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    const interval = setInterval(() => logger.debug({ event: 'heartbeat' }), 15000);
    interval.unref();
  } catch (err) {
    logger.error({ event: 'server_start_error', error: err });
    throw err;
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

export { createApp };
