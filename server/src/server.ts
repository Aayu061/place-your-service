import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { Server } from 'node:http';
import { startReportEmailDeliveryWorker } from './services/reportEmail.service.js';
import { emailOutboxService } from './services/email/emailOutbox.service.js';
import { operationsService } from './services/operations.service.js';

let server: Server | null = null;
let reportEmailWorker: NodeJS.Timeout | null = null;
let outboxEmailWorker: NodeJS.Timeout | null = null;
let notificationWorker: NodeJS.Timeout | null = null;

function startServer(): void {
  const port = env.PORT;

  server = app.listen(port, '0.0.0.0', () => {
    logger.info(`Place Your Service API server started`, {
      port,
      environment: env.NODE_ENV,
      pid: process.pid,
    });
    reportEmailWorker = startReportEmailDeliveryWorker();
    outboxEmailWorker = setInterval(() => {
      void emailOutboxService.processPending().catch((error) => logger.error('Unified email outbox worker failed', {
        error: error instanceof Error ? error.message : 'Unknown worker error',
      }));
    }, 60 * 1000);
    outboxEmailWorker.unref();
    notificationWorker = setInterval(() => {
      void operationsService.generateNotifications().catch((error) => logger.error('Scheduled notification generation failed', {
        error: error instanceof Error ? error.message : 'Unknown worker error',
      }));
      void emailOutboxService.runAmcExpiryReminders().catch((error) => logger.error('AMC expiry reminder worker failed', {
        error: error instanceof Error ? error.message : 'Unknown worker error',
      }));
    }, 10 * 60 * 1000);
    notificationWorker.unref();
    void operationsService.generateNotifications().catch((error) => logger.error('Initial notification generation failed', {
      error: error instanceof Error ? error.message : 'Unknown worker error',
    }));
  });

  // Graceful shutdown handling
  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}. Initiating graceful shutdown...`);
    if (reportEmailWorker) clearInterval(reportEmailWorker);
    if (outboxEmailWorker) clearInterval(outboxEmailWorker);
    if (notificationWorker) clearInterval(notificationWorker);

    if (server) {
      server.close((err) => {
        if (err) {
          logger.error('Error during HTTP server shutdown', { error: err.message });
          process.exit(1);
        }
        logger.info('HTTP server closed successfully. Process exiting.');
        process.exit(0);
      });

      // Force shutdown after 10 seconds if hanging
      setTimeout(() => {
        logger.error('Graceful shutdown timeout exceeded. Forcefully terminating process.');
        process.exit(1);
      }, 10000).unref();
    } else {
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Promise Rejection detected', {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception detected. Terminating process.', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  });
}

// Start if not loaded in test runner
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export { server, startServer };
