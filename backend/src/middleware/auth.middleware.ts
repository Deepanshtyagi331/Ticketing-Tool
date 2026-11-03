import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest, AuthUser } from '../types/auth.types.js';
import type { UserRole } from '../models/User.model.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { AppError } from '../errors/AppError.js';

/**
 * Authentication middleware: verifies Bearer JWT in Authorization header.
 */
export const authenticate = (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw AppError.unauthorized('Authorization header with Bearer token is required');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw AppError.unauthorized('Token missing from Bearer authorization');
    }

    const payload = verifyAccessToken(token);

    const user: AuthUser = {
      id: payload.userId,
      email: payload.email,
      role: payload.role
    };

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Role-based authorization middleware.
 */
export const requireRole = (...roles: UserRole[]) => {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(AppError.unauthorized('Authentication required'));
      return;
    }

    if (!roles.includes(req.user.role)) {
      next(AppError.forbidden(`Access forbidden: requires one of [${roles.join(', ')}] roles`));
      return;
    }

    next();
  };
};

/**
 * Convenience middleware for admin-only routes.
 */
export const requireAdmin = requireRole('admin');

