import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../types/auth.types.js';

/**
 * Booking Rate Limiter:
 * - Window: 1 minute (60,000ms)
 * - Limit: 5 requests per minute per authenticated user
 * - User-scoped Key Generator: Uses authenticated user ID (req.user.id) rather than IP alone,
 *   preventing denial-of-service among multiple users behind shared NAT/VPN gateways.
 * - Multi-instance readiness: express-rate-limit defaults to in-memory store for local development.
 *   For multi-instance distributed clusters, drop in 'rate-limit-redis' (store: new RedisStore({ sendCommand: ... })).
 */
export const bookingRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requests per window
  standardHeaders: true, // Return standard `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  keyGenerator: (req: Request): string => {
    const authReq = req as AuthenticatedRequest;
    if (authReq.user?.id) {
      return `user_${authReq.user.id}`;
    }
    return req.ip || 'anonymous';
  },
  handler: (_req: Request, res: Response): void => {
    res.status(429).json({
      success: false,
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many booking requests. Maximum 5 requests per minute allowed.'
      }
    });
  }
});

