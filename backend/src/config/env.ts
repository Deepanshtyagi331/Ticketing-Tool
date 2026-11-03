import dotenv from 'dotenv';
import path from 'node:path';
import { z } from 'zod';

// Load .env relative to backend root
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  PORT: z
    .string()
    .default('5001')
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val > 0 && val <= 65535, {
      message: 'PORT must be a valid port number between 1 and 65535'
    }),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  MONGO_URI: z
    .string()
    .min(1, { message: 'MONGO_URI is required' })
    .default('mongodb://127.0.0.1:27017/ticket_booking'),
  JWT_SECRET: z
    .string()
    .min(16, { message: 'JWT_SECRET must be at least 16 characters long' })
    .default('super_secret_jwt_key_at_least_32_characters_long'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  PAYMENT_WEBHOOK_SECRET: z
    .string()
    .default('webhook_super_secret_shared_hmac_key_2026'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  RATE_LIMIT_WINDOW_MS: z
    .string()
    .default('900000')
    .transform((val) => parseInt(val, 10)),
  RATE_LIMIT_MAX_REQUESTS: z
    .string()
    .default('100')
    .transform((val) => parseInt(val, 10))
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Environment configuration validation failed:');
  console.error(JSON.stringify(parsedEnv.error.format(), null, 2));
  process.exit(1);
}

export const env = parsedEnv.data;
export type Env = z.infer<typeof envSchema>;
