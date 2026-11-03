import http from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { expiryWorkerInstance } from './services/expiry.worker.js';

let server: http.Server | null = null;

async function bootstrap(): Promise<void> {
  try {
    console.log(`🚀 Initializing Ticket Booking API in [${env.NODE_ENV}] mode...`);

    // Connect to MongoDB
    await connectDatabase();

    // Start Background Expiry Worker (runs every 30 seconds)
    expiryWorkerInstance.start(30000);

    const app = createApp();
    server = http.createServer(app);

    server.listen(env.PORT, () => {
      console.log(`📡 Server listening on http://localhost:${env.PORT}`);
      console.log(`🩺 Health check ready at http://localhost:${env.PORT}/health`);
      console.log(`📚 Swagger API docs ready at http://localhost:${env.PORT}/api-docs`);
      console.log(`📄 OpenAPI specification ready at http://localhost:${env.PORT}/api-docs.json`);
    });

    // Handle process signals for graceful shutdown
    const shutdownHandler = async (signal: string) => {
      console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);

      // Stop Expiry Worker polling
      expiryWorkerInstance.stop();

      if (server) {
        server.close(async () => {
          console.log('🚪 HTTP server closed cleanly.');
          await disconnectDatabase();
          console.log('👋 Process exiting gracefully.');
          process.exit(0);
        });

        // Force shutdown after 10s if connections linger
        setTimeout(() => {
          console.error('⚠️ Forcefully terminating process after timeout.');
          process.exit(1);
        }, 10000).unref();
      } else {
        await disconnectDatabase();
        process.exit(0);
      }
    };

    process.on('SIGTERM', () => void shutdownHandler('SIGTERM'));
    process.on('SIGINT', () => void shutdownHandler('SIGINT'));

    process.on('unhandledRejection', (reason) => {
      console.error('💥 Unhandled Rejection:', reason);
    });

    process.on('uncaughtException', (err) => {
      console.error('💥 Uncaught Exception:', err);
      process.exit(1);
    });
  } catch (err) {
    console.error('❌ Failed to start application:', err);
    process.exit(1);
  }
}

void bootstrap();
