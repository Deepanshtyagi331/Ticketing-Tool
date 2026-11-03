import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { Logger } from '../utils/logger.js';

export const requestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const existingId = req.headers['x-request-id'] as string | undefined;
  const requestId = existingId?.trim() ? existingId.trim() : crypto.randomUUID();

  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);

  // Structured access log (sensitive headers and body automatically redacted)
  Logger.info(`Incoming ${req.method} ${req.originalUrl}`, requestId, {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip
  });

  next();
};

