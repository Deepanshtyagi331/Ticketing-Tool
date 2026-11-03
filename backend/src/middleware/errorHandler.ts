import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError.js';
import { env } from '../config/env.js';
import { Logger } from '../utils/logger.js';

export const errorHandler: ErrorRequestHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const requestId = req.id || 'system';

  // Handle Zod Validation Errors
  if (err instanceof ZodError) {
    Logger.warn('Validation error occurred', requestId, { issues: err.issues });
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: err.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message
        }))
      }
    });
    return;
  }

  // Handle known operational AppError
  if (err instanceof AppError) {
    Logger.warn(`Operational error: ${err.message}`, requestId, {
      statusCode: err.statusCode,
      details: err.details
    });
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: getErrorCodeForStatus(err.statusCode),
        message: err.message,
        ...(err.details ? { details: err.details } : {})
      }
    });
    return;
  }

  // Handle Mongoose CastError / ValidationError
  if (err.name === 'CastError') {
    Logger.warn('Invalid ID format', requestId, { error: err.message });
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_ID',
        message: 'Resource identifier format is invalid'
      }
    });
    return;
  }

  if (err.name === 'ValidationError') {
    Logger.warn('Mongoose validation error', requestId, { error: err.message });
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: err.message
      }
    });
    return;
  }

  // Handle MongoDB Duplicate Key (E11000)
  const anyErr = err as { code?: number };
  if (anyErr.code === 11000) {
    Logger.warn('Duplicate key conflict', requestId, { error: err.message });
    res.status(409).json({
      success: false,
      error: {
        code: 'CONFLICT',
        message: 'Resource conflict: a record with these unique details already exists'
      }
    });
    return;
  }

  // Fallback for unexpected internal errors
  const isDev = env.NODE_ENV === 'development';
  Logger.error(`Unhandled internal exception: ${err.message}`, requestId, {
    stack: isDev ? err.stack : undefined
  });

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: isDev ? err.message : 'An unexpected error occurred',
      ...(isDev ? { stack: err.stack } : {})
    }
  });
};

function getErrorCodeForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 429:
      return 'TOO_MANY_REQUESTS';
    default:
      return 'APPLICATION_ERROR';
  }
}
