import crypto from 'node:crypto';
import { api } from './api-client.js';
import { TEST_CONFIG, generateRunId } from '../config/test-config.js';

export interface TestUserSession {
  email: string;
  password: string;
  name: string;
  role: 'admin' | 'user';
  userId: string;
  accessToken: string;
  refreshTokenCookie: string;
}

export async function createTestUser(options?: {
  role?: 'admin' | 'user';
  namePrefix?: string;
  password?: string;
}): Promise<TestUserSession> {
  const role = options?.role || 'user';
  const runId = generateRunId();
  const name = `${options?.namePrefix || (role === 'admin' ? 'Test Admin' : 'Test User')} ${runId}`;
  const email = `test_${role}_${runId}@test.local`;
  const password = options?.password || TEST_CONFIG.DEFAULT_PASSWORD;

  const res = await api.post<{
    success: boolean;
    data: {
      accessToken: string;
      user: { _id?: string; id?: string; name: string; email: string; role: 'admin' | 'user' };
    };
  }>('/auth/register', {
    name,
    email,
    password,
    role
  });

  if (res.status !== 201 || !res.data.success) {
    throw new Error(`Failed to create test user: ${res.status} - ${JSON.stringify(res.data)}`);
  }

  const setCookie = res.headers.get('set-cookie') || '';
  const refreshTokenCookie = setCookie.split(';')[0] || '';
  const userId = (res.data.data.user._id || res.data.data.user.id || '').toString();

  return {
    email,
    password,
    name,
    role,
    userId,
    accessToken: res.data.data.accessToken,
    refreshTokenCookie
  };
}

export async function createAdminUser(namePrefix?: string): Promise<TestUserSession> {
  return createTestUser({ role: 'admin', namePrefix: namePrefix || 'QA Admin' });
}

export async function loginUser(email: string, password = TEST_CONFIG.DEFAULT_PASSWORD): Promise<{
  accessToken: string;
  refreshTokenCookie: string;
  userId: string;
  role: string;
}> {
  const res = await api.post<{
    success: boolean;
    data: {
      accessToken: string;
      user: { _id?: string; id?: string; role: string };
    };
  }>('/auth/login', {
    email,
    password
  });

  if (res.status !== 200 || !res.data.success) {
    throw new Error(`Failed to log in test user: ${res.status} - ${JSON.stringify(res.data)}`);
  }

  const setCookie = res.headers.get('set-cookie') || '';
  const refreshTokenCookie = setCookie.split(';')[0] || '';
  const userId = (res.data.data.user._id || res.data.data.user.id || '').toString();

  return {
    accessToken: res.data.data.accessToken,
    refreshTokenCookie,
    userId,
    role: res.data.data.user.role
  };
}

export function calculateWebhookHmac(payload: string, secret = TEST_CONFIG.PAYMENT_WEBHOOK_SECRET): string {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

