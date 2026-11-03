import crypto from 'node:crypto';

/**
 * Computes SHA-256 hash of a string (e.g. refresh token).
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generates a cryptographically secure random token.
 */
export function generateRandomToken(bytes: number = 40): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Generates a unique family ID for token rotation tracking.
 */
export function generateFamilyId(): string {
  return crypto.randomUUID();
}

