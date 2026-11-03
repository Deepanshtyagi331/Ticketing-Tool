const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'refreshtoken',
  'accesstoken',
  'secret',
  'signature',
  'authorization',
  'creditcard',
  'cvv',
  'cardnumber'
]);

function redactSensitiveData(obj: unknown, depth = 0): unknown {
  if (depth > 5) return '[Truncated]';
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitiveData(item, depth + 1));
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactSensitiveData(value, depth + 1);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

export class Logger {
  private static formatMessage(
    level: 'INFO' | 'WARN' | 'ERROR',
    message: string,
    requestId?: string,
    meta?: unknown
  ): string {
    const timestamp = new Date().toISOString();
    const reqId = requestId || 'system';
    const sanitizedMeta = meta ? redactSensitiveData(meta) : undefined;

    return JSON.stringify({
      timestamp,
      level,
      requestId: reqId,
      message,
      ...(sanitizedMeta ? { meta: sanitizedMeta } : {})
    });
  }

  public static info(message: string, requestId?: string, meta?: unknown): void {
    console.log(this.formatMessage('INFO', message, requestId, meta));
  }

  public static warn(message: string, requestId?: string, meta?: unknown): void {
    console.warn(this.formatMessage('WARN', message, requestId, meta));
  }

  public static error(message: string, requestId?: string, meta?: unknown): void {
    console.error(this.formatMessage('ERROR', message, requestId, meta));
  }
}
