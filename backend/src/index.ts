import http from 'http';
import express from 'express';
import cors from 'cors';
import { config } from './config';
import { logger } from './utils/logger';
import authRoutes from './routes/auth.routes';
import executeRoutes from './routes/execute.routes';
import jobsRoutes from './routes/jobs.routes';
import { errorHandler } from './middleware/error.middleware';
import { setupWebSocketServer } from './websocket/ws.handler';
import { warmPool } from './execution/warm-pool';
import { checkDbHealth } from './db/client';

const app = express();
const server = http.createServer(app);

// CORS configuration
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json());

// Health check endpoint
app.get('/health', async (_req, res) => {
  const dbHealthy = await checkDbHealth();
  const warmPoolStatus = warmPool.getStatus();

  const status = dbHealthy ? 200 : 500;
  res.status(status).json({
    status: dbHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    services: {
      database: dbHealthy ? 'up' : 'down',
      warmPool: warmPoolStatus,
    },
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/execute', executeRoutes);
app.use('/api/jobs', jobsRoutes);

// Error Handling Middleware
app.use(errorHandler);

// Setup WebSocket Server
setupWebSocketServer(server);

// Start server and initialize warm pool
async function start() {
  try {
    // Initialize container warm pool
    await warmPool.initialize();

    server.listen(config.port, () => {
      logger.info(`CodeSphere API server running on port ${config.port} (${config.nodeEnv})`);
    });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to start CodeSphere server');
    process.exit(1);
  }
}

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await warmPool.drain();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

start();
