import 'dotenv/config';
import http from 'http';
import app from './app';
import { initDB } from './db';
import { createWebSocketGateway } from './websocket/gateway';

const PORT = parseInt(process.env.PORT || '3001', 10);

async function bootstrap() {
  try {
    await initDB();

    const httpServer = http.createServer(app);
    createWebSocketGateway(httpServer);

    httpServer.listen(PORT, () => {
      console.log(`✅ SyncSphere server running on port ${PORT}`);
      console.log(`   NODE_ENV: ${process.env.NODE_ENV}`);
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
