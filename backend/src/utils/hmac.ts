import crypto from 'node:crypto';

/**
 * Computes the HMAC SHA-256 hex digest for a raw payload.
 */
export function computeHmac(payload: Buffer | string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Timing-safe HMAC verification to protect against timing attacks.
 */
export function verifyHmac(
  payload: Buffer | string,
  receivedSignature: string,
  secret: string
): boolean {
  try {
    if (!receivedSignature || !secret) {
      return false;
    }

    // Strip optional "sha256=" prefix if provided (e.g. Stripe / GitHub style)
    const normalizedSignature = receivedSignature.replace(/^sha256=/, '').trim();

    const expectedSignature = computeHmac(payload, secret);

    const expectedBuffer = Buffer.from(expectedSignature, 'utf-8');
    const receivedBuffer = Buffer.from(normalizedSignature, 'utf-8');

    // timingSafeEqual requires buffers of identical length
    if (expectedBuffer.length !== receivedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
  } catch {
    return false;
  }
}

