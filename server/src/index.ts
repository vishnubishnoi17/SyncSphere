import 'dotenv/config';
import http from 'http';
import app from './app';
import { env } from './config/env';
import { initDB } from './db';
import { createWebSocketGateway } from './websocket/gateway';

async function bootstrap() {
  try {
    await initDB();

    const httpServer = http.createServer(app);
    createWebSocketGateway(httpServer);

    httpServer.listen(env.PORT, () => {
      console.log(`✅ SyncSphere server running on port ${env.PORT}`);
      console.log(`   NODE_ENV: ${env.NODE_ENV}`);
    });

    const shutdown = () => {
      console.log('\nShutting down...');
      httpServer.close(() => process.exit(0));
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

bootstrap();
