/**
 * Global configuration for the standalone API test suite.
 * Configurable via environment variables.
 */
export const TEST_CONFIG = {
  API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:5001',
  PAYMENT_WEBHOOK_SECRET: process.env.PAYMENT_WEBHOOK_SECRET || 'webhook_super_secret_shared_hmac_key_2026',
  DEFAULT_PASSWORD: 'SecureQAPassword123!',
  REQUEST_TIMEOUT_MS: 15000,
};

export function generateRunId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

