import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

/**
 * Hashes a plaintext password with bcrypt.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compares plaintext password against a bcrypt hash.
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

