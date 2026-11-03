import { describe, test, assert, assertEqual, assertStatus } from './helpers/assertions.js';
import { api } from './helpers/api-client.js';
import { createTestUser, createAdminUser, loginUser } from './helpers/auth-helper.js';
import { generateRunId } from './config/test-config.js';

describe('Authentication & Authorization Test Suite', async () => {
  const runId = generateRunId();
  const testEmail = `auth_test_${runId}@test.local`;
  const testPassword = 'StrongPassword123!';

  await test('POST /auth/register - Successfully registers user with hashed password', async () => {
    const res = await api.post<{
      success: boolean;
      data: { user: { email: string; role: string; passwordHash?: string }; accessToken: string };
    }>('/auth/register', {
      name: 'Auth Test User',
      email: testEmail,
      password: testPassword,
      role: 'user'
    });

    assertStatus(res.status, 201, 'User registration');
    assert(res.data.success, 'Registration response success must be true');
    assertEqual(res.data.data.user.email, testEmail, 'Returned email matches registration');
    assertEqual(res.data.data.user.role, 'user', 'Default role is user');
    assert(!res.data.data.user.passwordHash, 'passwordHash must never be exposed');
    assert(typeof res.data.data.accessToken === 'string', 'Access token must be returned');

    const setCookie = res.headers.get('set-cookie');
    assert(!!setCookie && setCookie.includes('refreshToken='), 'HttpOnly refresh token cookie must be set');
  });

  await test('POST /auth/register - Rejects registration with missing required fields', async () => {
    const res = await api.post<{ success: boolean; error: { code: string } }>('/auth/register', {
      email: `incomplete_${runId}@test.local`
    });

    assertStatus(res.status, 400, 'Missing name and password');
    assertEqual(res.data.success, false);
    assertEqual(res.data.error.code, 'VALIDATION_ERROR');
  });

  await test('POST /auth/register - Rejects weak password (< 8 characters)', async () => {
    const res = await api.post<{ success: boolean; error: { code: string } }>('/auth/register', {
      name: 'Short Password',
      email: `shortpass_${runId}@test.local`,
      password: 'short'
    });

    assertStatus(res.status, 400, 'Short password');
    assertEqual(res.data.success, false);
    assertEqual(res.data.error.code, 'VALIDATION_ERROR');
  });

  await test('POST /auth/register - Rejects duplicate email registration', async () => {
    const res = await api.post<{ success: boolean; error: { code: string } }>('/auth/register', {
      name: 'Duplicate Candidate',
      email: testEmail,
      password: testPassword
    });

    assertStatus(res.status, 409, 'Duplicate email');
    assertEqual(res.data.success, false);
    assertEqual(res.data.error.code, 'CONFLICT');
  });

  await test('POST /auth/login - Successfully authenticates with valid credentials', async () => {
    const res = await api.post<{
      success: boolean;
      data: { accessToken: string; user: { email: string } };
    }>('/auth/login', {
      email: testEmail,
      password: testPassword
    });

    assertStatus(res.status, 200, 'Login with correct credentials');
    assert(res.data.success, 'Login response success must be true');
    assert(!!res.data.data.accessToken, 'Access token returned');
    assertEqual(res.data.data.user.email, testEmail);

    const setCookie = res.headers.get('set-cookie');
    assert(!!setCookie && setCookie.includes('refreshToken='), 'Refresh token cookie returned');
  });

  await test('POST /auth/login - Rejects invalid password', async () => {
    const res = await api.post<{ success: boolean; error: { code: string } }>('/auth/login', {
      email: testEmail,
      password: 'IncorrectPassword999!'
    });

    assertStatus(res.status, 401, 'Invalid password');
    assertEqual(res.data.success, false);
    assertEqual(res.data.error.code, 'UNAUTHORIZED');
  });

  await test('POST /auth/login - Rejects non-existent account', async () => {
    const res = await api.post<{ success: boolean; error: { code: string } }>('/auth/login', {
      email: `non_existent_${runId}@test.local`,
      password: 'SomePassword123!'
    });

    assertStatus(res.status, 401, 'Non-existent account');
    assertEqual(res.data.success, false);
    assertEqual(res.data.error.code, 'UNAUTHORIZED');
  });

  await test('GET /auth/me - Protected endpoint requires valid Bearer token', async () => {
    const user = await createTestUser();

    // 1. Valid token
    const validRes = await api.get<{ success: boolean; data: { user: { email: string } } }>('/auth/me', {
      token: user.accessToken
    });
    assertStatus(validRes.status, 200, 'Valid token');
    assertEqual(validRes.data.data.user.email, user.email);

    // 2. Missing token
    const missingRes = await api.get<{ success: boolean }>('/auth/me');
    assertStatus(missingRes.status, 401, 'Missing token');

    // 3. Invalid/tampered token
    const tamperedRes = await api.get<{ success: boolean }>('/auth/me', {
      token: `${user.accessToken}tampered`
    });
    assertStatus(tamperedRes.status, 401, 'Tampered token');
  });

  await test('POST /auth/refresh - Rotates refresh token on use and detects reuse attack', async () => {
    // 1. Login user to obtain initial refresh token
    const user = await createTestUser();
    const loginRes = await api.post<{ data: { accessToken: string } }>('/auth/login', {
      email: user.email,
      password: user.password
    });
    const initialCookie = (loginRes.headers.get('set-cookie') || '').split(';')[0];
    assert(!!initialCookie, 'Initial refresh cookie obtained');

    // 2. Refresh token successfully (atomic rotation)
    const refreshRes = await api.post<{ success: boolean; data: { accessToken: string } }>('/auth/refresh', {}, {
      cookie: initialCookie
    });
    assertStatus(refreshRes.status, 200, 'Token refresh successful');
    assert(!!refreshRes.data.data.accessToken, 'New access token issued');

    const rotatedCookie = (refreshRes.headers.get('set-cookie') || '').split(';')[0];
    assert(!!rotatedCookie && rotatedCookie !== initialCookie, 'New rotated refresh cookie issued');

    // 3. Stolen token replay attack: Attempt to reuse the consumed initialCookie
    const reuseRes = await api.post<{ success: boolean; error: { code: string; message: string } }>('/auth/refresh', {}, {
      cookie: initialCookie
    });
    assertStatus(reuseRes.status, 401, 'Replay attack rejected');
    assert(
      reuseRes.data.error.message.includes('Refresh token reuse detected') ||
      reuseRes.data.error.code === 'UNAUTHORIZED',
      'Security violation flagged for token reuse'
    );

    // 4. Verify family wipe: The rotatedCookie must now also be invalid!
    const familyWipeCheck = await api.post('/auth/refresh', {}, { cookie: rotatedCookie });
    assertStatus(familyWipeCheck.status, 401, 'Entire token family revoked after reuse attempt');
  });

  await test('Role-Based Authorization - Enforces user vs admin permissions', async () => {
    const regularUser = await createTestUser({ role: 'user' });
    const adminUser = await createAdminUser();

    // 1. Regular user blocked from admin endpoint
    const blockedRes = await api.get<{ success: boolean; error: { code: string } }>('/auth/admin-only', {
      token: regularUser.accessToken
    });
    assertStatus(blockedRes.status, 403, 'Regular user blocked');
    assertEqual(blockedRes.data.error.code, 'FORBIDDEN');

    // 2. Admin user allowed on admin endpoint
    const allowedRes = await api.get<{ success: boolean }>('/auth/admin-only', {
      token: adminUser.accessToken
    });
    assertStatus(allowedRes.status, 200, 'Admin user allowed');
    assertEqual(allowedRes.data.success, true);
  });
});

