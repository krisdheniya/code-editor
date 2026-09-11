import { useEffect, useRef, useState, useCallback } from 'react';
import { Job } from '../types';

export function useWebSocket(token: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [latestJobUpdate, setLatestJobUpdate] = useState<{ jobId: string; data: Partial<Job> } | null>(null);

  useEffect(() => {
    if (!token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host; // includes hostname and port if present
    const wsUrl = `${protocol}//${host}/ws?token=${token}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'job_update') {
          setLatestJobUpdate({ jobId: message.jobId, data: message.data });
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [token]);

  const subscribeToJob = useCallback((jobId: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', jobId }));
    }
  }, []);

  const unsubscribeFromJob = useCallback((jobId: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'unsubscribe', jobId }));
    }
  }, []);

  return { isConnected, latestJobUpdate, subscribeToJob, unsubscribeFromJob };
}
