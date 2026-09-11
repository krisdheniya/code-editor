import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { redisSub } from '../db/redis.client';
import { verifyToken } from '../services/auth.service';
import { createLogger } from '../utils/logger';

const log = createLogger('ws-handler');

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  subscribedJobIds?: Set<string>;
}

export function setupWebSocketServer(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  // Map of jobId -> Set of connected WebSocket clients subscribed to that job
  const subscriptions = new Map<string, Set<AuthenticatedWebSocket>>();

  // Subscribe to Redis pub/sub channel for job completion events
  redisSub.subscribe('codesphere:job-updates', (err) => {
    if (err) {
      log.error({ err }, 'Failed to subscribe to Redis job-updates channel');
    } else {
      log.info('Subscribed to Redis codesphere:job-updates channel');
    }
  });

  redisSub.on('message', (channel, message) => {
    if (channel !== 'codesphere:job-updates') return;

    try {
      const parsed = JSON.parse(message);
      const { jobId, data } = parsed;

      if (jobId && subscriptions.has(jobId)) {
        const clients = subscriptions.get(jobId)!;
        const payload = JSON.stringify({ type: 'job_update', jobId, data });

        for (const client of clients) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
          }
        }
      }
    } catch (err: any) {
      log.error({ err: err.message }, 'Failed to process Redis pub/sub message');
    }
  });

  wss.on('connection', (ws: AuthenticatedWebSocket, req) => {
    log.info('New WebSocket connection request');

    // Authenticate via query param: /ws?token=<jwt>
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, 'Unauthorized: Token required');
      return;
    }

    try {
      const payload = verifyToken(token);
      ws.userId = payload.userId;
      ws.subscribedJobIds = new Set();
      log.info({ userId: ws.userId }, 'WebSocket authenticated');
    } catch {
      ws.close(4001, 'Unauthorized: Invalid token');
      return;
    }

    ws.on('message', (rawMessage) => {
      try {
        const message = JSON.parse(rawMessage.toString());
        const { type, jobId } = message;

        if (type === 'subscribe' && jobId) {
          ws.subscribedJobIds!.add(jobId);
          if (!subscriptions.has(jobId)) {
            subscriptions.set(jobId, new Set());
          }
          subscriptions.get(jobId)!.add(ws);
          log.debug({ userId: ws.userId, jobId }, 'Client subscribed to job');

          ws.send(JSON.stringify({ type: 'subscribed', jobId }));
        } else if (type === 'unsubscribe' && jobId) {
          ws.subscribedJobIds!.delete(jobId);
          if (subscriptions.has(jobId)) {
            subscriptions.get(jobId)!.delete(ws);
            if (subscriptions.get(jobId)!.size === 0) {
              subscriptions.delete(jobId);
            }
          }
          log.debug({ userId: ws.userId, jobId }, 'Client unsubscribed from job');
        }
      } catch (err: any) {
        log.warn({ err: err.message }, 'Invalid WebSocket message received');
      }
    });

    ws.on('close', () => {
      log.info({ userId: ws.userId }, 'WebSocket connection closed');
      if (ws.subscribedJobIds) {
        for (const jobId of ws.subscribedJobIds) {
          if (subscriptions.has(jobId)) {
            subscriptions.get(jobId)!.delete(ws);
            if (subscriptions.get(jobId)!.size === 0) {
              subscriptions.delete(jobId);
            }
          }
        }
      }
    });
  });

  return wss;
}
