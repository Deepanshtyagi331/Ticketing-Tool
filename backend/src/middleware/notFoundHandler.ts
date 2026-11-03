import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError.js';

export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  next(AppError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
};
