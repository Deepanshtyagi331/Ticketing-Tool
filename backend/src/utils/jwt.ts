import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import type { AccessTokenPayload } from '../types/auth.types.js';
import { AppError } from '../errors/AppError.js';

const ACCESS_TOKEN_EXPIRATION = '15m';

/**
 * Signs a 15-minute access token with unique JWT ID (jti).
 */
export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRATION,
    jwtid: crypto.randomUUID()
  });
}

/**
 * Verifies and decodes an access token.
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    return jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw AppError.unauthorized('Access token has expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw AppError.unauthorized('Invalid access token');
    }
    throw AppError.unauthorized('Authentication failed');
  }
}
