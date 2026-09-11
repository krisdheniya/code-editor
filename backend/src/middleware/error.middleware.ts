import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { AuthError } from '../services/auth.service';

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  logger.error({ err, url: req.url, method: req.method }, 'Unhandled API error');

  if (err instanceof AuthError) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal Server Error';

  return res.status(statusCode).json({
    error: message,
  });
}
