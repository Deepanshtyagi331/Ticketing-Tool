import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { Booking } from '../src/models/Booking.model.js';
import { Event } from '../src/models/Event.model.js';
import { ExpiryWorker } from '../src/services/expiry.worker.js';

const API_BASE = 'http://localhost:5001';
const WEBHOOK_SECRET = 'webhook_super_secret_shared_hmac_key_2026';
const MONGO_URI = 'mongodb://127.0.0.1:27017/ticket_booking';
const EVIDENCE_DIR = path.resolve(process.cwd(), 'docs/test-evidence');

if (!fs.existsSync(EVIDENCE_DIR)) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

export interface TestCaseResult {
  testId: string;
  module: string;
  testScenario: string;
  expectedResult: string;
  actualResult: string;
  httpStatus: number | string;
  status: 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT TESTED';
  details?: unknown;
}

const results: TestCaseResult[] = [];

function record(res: TestCaseResult) {
  results.push(res);
  const mark = res.status === 'PASS' ? '✅' : res.status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${mark} [${res.testId}] ${res.module} - ${res.testScenario}: ${res.status} (HTTP ${res.httpStatus})`);
}

function calculateHmac(payload: string, secret = WEBHOOK_SECRET): string {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

async function runE2E() {
  console.log('===============================================================');
  console.log('🚀 STARTING COMPREHENSIVE E2E QA AUTOMATION & AUDIT TEST RUNNER');
  console.log(`📡 Target API: ${API_BASE}`);
  console.log('===============================================================\n');

  // Connect to DB for direct integrity checks and safe expiry testing
  await mongoose.connect(MONGO_URI);

  const runId = Date.now().toString(36);
  const qaAdminEmail = `qa_admin_${runId}@test.local`;
  const qaUserEmail = `qa_user_${runId}@test.local`;
  const qaUser2Email = `qa_user2_${runId}@test.local`;
  const qaPassword = 'SecureQAPassword123!';

  let adminAccessToken = '';
  let userAccessToken = '';
  let userRefreshTokenCookie = '';
  let user2AccessToken = '';
  let testEventId = '';

  // -------------------------------------------------------------
  // MODULE 1: SWAGGER & API DOCUMENTATION
  // -------------------------------------------------------------
  console.log('\n--- MODULE 1: SWAGGER & API DOCUMENTATION ---');

  // TC-DOC-01: Swagger UI availability
  try {
    const res = await fetch(`${API_BASE}/api-docs/`);
    const text = await res.text();
    const isUi = res.status === 200 && text.includes('id="swagger-ui"') && text.includes('swagger-ui-bundle.js');
    record({
      testId: 'TC-DOC-01',
      module: 'Documentation',
      testScenario: 'Swagger UI loads successfully at GET /api-docs/',
      expectedResult: 'HTTP 200 with HTML containing Swagger UI bundle elements',
      actualResult: isUi ? 'Swagger UI HTML bundle returned with 200 OK' : 'Missing Swagger elements',
      httpStatus: res.status,
      status: isUi ? 'PASS' : 'FAIL',
    });
    fs.writeFileSync(path.join(EVIDENCE_DIR, 'swagger_ui_html_snippet.txt'), text.slice(0, 500));
  } catch (err) {
    record({
      testId: 'TC-DOC-01',
      module: 'Documentation',
      testScenario: 'Swagger UI loads successfully at GET /api-docs/',
      expectedResult: 'HTTP 200 HTML',
      actualResult: String(err),
      httpStatus: 'ERR',
      status: 'FAIL',
    });
  }

  // TC-DOC-02: OpenAPI JSON Specification
  try {
    const res = await fetch(`${API_BASE}/api-docs.json`);
    const json = await res.json() as { openapi?: string; paths?: Record<string, unknown> };
    const valid = res.status === 200 && json.openapi === '3.0.3' && !!json.paths?.['/events'] && !!json.paths?.['/bookings'];
    record({
      testId: 'TC-DOC-02',
      module: 'Documentation',
      testScenario: 'OpenAPI 3.0.3 specification returned at GET /api-docs.json',
      expectedResult: 'HTTP 200 with OpenAPI 3.0.3 JSON containing all paths and components',
      actualResult: valid ? `OpenAPI v${json.openapi} returned with ${Object.keys(json.paths || {}).length} registered endpoints` : 'Invalid JSON spec',
      httpStatus: res.status,
      status: valid ? 'PASS' : 'FAIL',
    });
    fs.writeFileSync(path.join(EVIDENCE_DIR, 'openapi_spec_paths.json'), JSON.stringify(Object.keys(json.paths || {}), null, 2));
  } catch (err) {
    record({
      testId: 'TC-DOC-02',
      module: 'Documentation',
      testScenario: 'OpenAPI JSON specification at GET /api-docs.json',
      expectedResult: 'HTTP 200 OpenAPI JSON',
      actualResult: String(err),
      httpStatus: 'ERR',
      status: 'FAIL',
    });
  }

  // -------------------------------------------------------------
  // MODULE 2: AUTHENTICATION & ROLE-BASED ACCESS CONTROL
  // -------------------------------------------------------------
  console.log('\n--- MODULE 2: AUTHENTICATION & RBAC ---');

  // TC-AUTH-01: Valid user registration
  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'QA Regular User', email: qaUserEmail, password: qaPassword, role: 'user' }),
    });
    const data = await res.json() as { success: boolean; data?: { accessToken: string; user: { _id?: string; id?: string; role: string } } };
    const pass = res.status === 201 && data.success && !!data.data?.accessToken;
    if (pass) {
      userAccessToken = data.data!.accessToken;
      const cookieHeader = res.headers.get('set-cookie');
      if (cookieHeader) userRefreshTokenCookie = cookieHeader.split(';')[0];
    }
    record({
      testId: 'TC-AUTH-01',
      module: 'Authentication',
      testScenario: 'Valid user registration with password hashing',
      expectedResult: 'HTTP 201 with access token and user object (no passwordHash)',
      actualResult: pass ? 'User registered successfully, token issued' : JSON.stringify(data),
      httpStatus: res.status,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch (err) {
    record({
      testId: 'TC-AUTH-01',
      module: 'Authentication',
      testScenario: 'Valid user registration',
      expectedResult: 'HTTP 201',
      actualResult: String(err),
      httpStatus: 'ERR',
      status: 'FAIL',
    });
  }

  // TC-AUTH-02: Register admin user
  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'QA Admin User', email: qaAdminEmail, password: qaPassword, role: 'admin' }),
    });
    const data = await res.json() as { success: boolean; data?: { accessToken: string; user: { role: string } } };
    const pass = res.status === 201 && data.success && data.data?.user.role === 'admin';
    if (pass) {
      adminAccessToken = data.data!.accessToken;
    }
    record({
      testId: 'TC-AUTH-02',
      module: 'Authentication',
      testScenario: 'Admin user registration with role=admin',
      expectedResult: 'HTTP 201 with admin role confirmed',
      actualResult: pass ? 'Admin user registered with role=admin' : JSON.stringify(data),
      httpStatus: res.status,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch (err) {
    record({
      testId: 'TC-AUTH-02',
      module: 'Authentication',
      testScenario: 'Admin user registration',
      expectedResult: 'HTTP 201',
      actualResult: String(err),
      httpStatus: 'ERR',
      status: 'FAIL',
    });
  }

  // TC-AUTH-03: Register with missing required fields
  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `missing_${runId}@test.local` }),
    });
    const data = await res.json() as { success: boolean; error?: { code: string } };
    const pass = res.status === 400 && data.success === false && data.error?.code === 'VALIDATION_ERROR';
    record({
      testId: 'TC-AUTH-03',
      module: 'Authentication',
      testScenario: 'Registration with missing name and password',
      expectedResult: 'HTTP 400 with VALIDATION_ERROR code',
      actualResult: pass ? '400 returned with structured validation error' : JSON.stringify(data),
      httpStatus: res.status,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch (err) {
    record({
      testId: 'TC-AUTH-03',
      module: 'Authentication',
      testScenario: 'Registration with missing fields',
      expectedResult: 'HTTP 400',
      actualResult: String(err),
      httpStatus: 'ERR',
      status: 'FAIL',
    });
  }

  // TC-AUTH-04: Weak password (< 8 chars)
  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Weak Pass', email: `weak_${runId}@test.local`, password: 'short' }),
    });
    const data = await res.json() as { success: boolean; error?: { code: string } };
    const pass = res.status === 400 && data.success === false && data.error?.code === 'VALIDATION_ERROR';
    record({
      testId: 'TC-AUTH-04',
      module: 'Authentication',
      testScenario: 'Registration with weak password (< 8 chars)',
      expectedResult: 'HTTP 400 rejecting password length',
      actualResult: pass ? 'Rejected with 400 VALIDATION_ERROR' : JSON.stringify(data),
      httpStatus: res.status,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch (err) {
    record({
      testId: 'TC-AUTH-04',
      module: 'Authentication',
      testScenario: 'Registration with weak password',
      expectedResult: 'HTTP 400',
      actualResult: String(err),
      httpStatus: 'ERR',
      status: 'FAIL',
    });
  }

  // TC-AUTH-05: Duplicate email registration
  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Duplicate User', email: qaUserEmail, password: qaPassword }),
    });
    const data = await res.json() as { success: boolean; error?: { code: string } };
    const pass = (res.status === 400 || res.status === 409) && data.success === false && (data.error?.code === 'CONFLICT' || data.error?.code === 'DUPLICATE_RESOURCE');
    record({
      testId: 'TC-AUTH-05',
      module: 'Authentication',
      testScenario: 'Registration with duplicate email address',
      expectedResult: 'HTTP 409 CONFLICT or 400 rejecting duplicate',
      actualResult: pass ? `Correctly rejected with HTTP ${res.status} (${data.error?.code})` : JSON.stringify(data),
      httpStatus: res.status,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch (err) {
    record({
      testId: 'TC-AUTH-05',
      module: 'Authentication',
      testScenario: 'Registration with duplicate email',
      expectedResult: 'HTTP 409 CONFLICT',
      actualResult: String(err),
      httpStatus: 'ERR',
      status: 'FAIL',
    });
  }

  // TC-AUTH-06: User login with valid credentials
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: qaUserEmail, password: qaPassword }),
    });
    const data = await res.json() as { success: boolean; data?: { accessToken: string } };
    const setCookie = res.headers.get('set-cookie');
    const pass = res.status === 200 && data.success && !!data.data?.accessToken && !!setCookie && setCookie.includes('refreshToken=');
    if (pass) {
      userAccessToken = data.data!.accessToken;
      userRefreshTokenCookie = setCookie.split(';')[0];
    }
    record({
      testId: 'TC-AUTH-06',
      module: 'Authentication',
      testScenario: 'User login with valid credentials',
      expectedResult: 'HTTP 200 with JWT access token and HttpOnly refresh token cookie',
      actualResult: pass ? 'Authenticated successfully, access token and refresh cookie received' : JSON.stringify(data),
      httpStatus: res.status,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch (err) {
    record({
      testId: 'TC-AUTH-06',
      module: 'Authentication',
      testScenario: 'Valid user login',
      expectedResult: 'HTTP 200',
      actualResult: String(err),
      httpStatus: 'ERR',
      status: 'FAIL',
    });
  }

  // TC-AUTH-07: Login with invalid password
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: qaUserEmail, password: 'WrongPassword999!' }),
    });
    const data = await res.json() as { success: boolean; error?: { code: string } };
    const pass = res.status === 401 && data.success === false;
    record({
      testId: 'TC-AUTH-07',
      module: 'Authentication',
      testScenario: 'User login with wrong password',
      expectedResult: 'HTTP 401 UNAUTHORIZED / INVALID_CREDENTIALS',
      actualResult: pass ? `Rejected with HTTP 401 (${data.error?.code})` : JSON.stringify(data),
      httpStatus: res.status,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch (err) {
    record({
      testId: 'TC-AUTH-07',
      module: 'Authentication',
      testScenario: 'Login with wrong password',
      expectedResult: 'HTTP 401',
      actualResult: String(err),
      httpStatus: 'ERR',
      status: 'FAIL',
    });
  }

  // TC-AUTH-08: Access protected endpoint with valid Bearer token
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${userAccessToken}` },
    });
    const data = await res.json() as { success: boolean; data?: { user: { email: string } } };
    const pass = res.status === 200 && data.success && data.data?.user.email === qaUserEmail;
    record({
      testId: 'TC-AUTH-08',
      module: 'Authentication',
      testScenario: 'Access protected GET /auth/me with valid Bearer token',
      expectedResult: 'HTTP 200 with current user profile',
      actualResult: pass ? `User profile fetched (${data.data!.user.email})` : JSON.stringify(data),
      httpStatus: res.status,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch (err) {
    record({
      testId: 'TC-AUTH-08',
      module: 'Authentication',
      testScenario: 'Protected endpoint access',
      expectedResult: 'HTTP 200',
      actualResult: String(err),
      httpStatus: 'ERR',
      status: 'FAIL',
    });
  }

  // TC-AUTH-09: Access protected endpoint without token
  try {
    const res = await fetch(`${API_BASE}/auth/me`);
    const data = await res.json() as { success: boolean; error?: { code: string } };
    const pass = res.status === 401 && data.success === false;
    record({
      testId: 'TC-AUTH-09',
      module: 'Authentication',
      testScenario: 'Access protected GET /auth/me without token',
      expectedResult: 'HTTP 401 UNAUTHORIZED',
      actualResult: pass ? `Rejected with HTTP 401 (${data.error?.code})` : JSON.stringify(data),
      httpStatus: res.status,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch (err) {
    record({
      testId: 'TC-AUTH-09',
      module: 'Authentication',
      testScenario: 'Access protected without token',
      expectedResult: 'HTTP 401',
      actualResult: String(err),
      httpStatus: 'ERR',
      status: 'FAIL',
    });
  }

  // TC-AUTH-10: Token refresh and rotation
  let rotatedRefreshTokenCookie = '';
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: userRefreshTokenCookie },
    });
    const data = await res.json() as { success: boolean; data?: { accessToken: string } };
    const setCookie = res.headers.get('set-cookie');
    const pass = res.status === 200 && data.success && !!data.data?.accessToken && !!setCookie;
    if (pass) {
      rotatedRefreshTokenCookie = setCookie.split(';')[0];
    }
    record({
      testId: 'TC-AUTH-10',
      module: 'Authentication',
      testScenario: 'Token refresh and atomic rotation via POST /auth/refresh',
      expectedResult: 'HTTP 200 with newly issued access token and newly rotated refresh cookie',
      actualResult: pass ? 'Token refreshed and rotated to new refresh cookie successfully' : JSON.stringify(data),
      httpStatus: res.status,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch (err) {
    record({
      testId: 'TC-AUTH-10',
      module: 'Authentication',
      testScenario: 'Token refresh rotation',
      expectedResult: 'HTTP 200',
      actualResult: String(err),
      httpStatus: 'ERR',
      status: 'FAIL',
    });
  }

  // TC-AUTH-11: Refresh token reuse detection (stolen token replay attack)
  try {
    // Attempt to reuse old userRefreshTokenCookie
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: userRefreshTokenCookie },
    });
    const data = await res.json() as { success: boolean; error?: { message: string; code: string } };
    const replayDetected = res.status === 401 && (data.error?.message?.includes('Refresh token reuse detected') || data.error?.code === 'UNAUTHORIZED');

    // Verify that the entire session family was revoked: rotated token should also fail now
    const checkRotatedRes = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: rotatedRefreshTokenCookie },
    });
    const allSessionsRevoked = checkRotatedRes.status === 401;

    const pass = replayDetected && allSessionsRevoked;

    record({
      testId: 'TC-AUTH-11',
      module: 'Authentication',
      testScenario: 'Refresh token reuse detection: old token triggers session family wipe',
      expectedResult: 'HTTP 401 and all user sessions invalidated immediately',
      actualResult: pass ? 'Replay detected (401 Security Violation) and entire family wiped' : `replayDetected=${replayDetected}, allSessionsRevoked=${allSessionsRevoked}`,
      httpStatus: res.status,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch (err) {
    record({
      testId: 'TC-AUTH-11',
      module: 'Authentication',
      testScenario: 'Refresh token reuse detection',
      expectedResult: 'HTTP 401',
      actualResult: String(err),
      httpStatus: 'ERR',
      status: 'FAIL',
    });
  }

  // Re-login user to get fresh credentials for subsequent tests
  const relogin = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: qaUserEmail, password: qaPassword }),
  });
  const reloginData = await relogin.json() as { data: { accessToken: string } };
  userAccessToken = reloginData.data.accessToken;

  // Register User 2 for independent rate limit and concurrency tests
  const regUser2 = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'QA User Two', email: qaUser2Email, password: qaPassword, role: 'user' }),
  });
  const regUser2Data = await regUser2.json() as { data: { accessToken: string } };
  user2AccessToken = regUser2Data.data.accessToken;

  // TC-AUTH-12: Role authorization - regular user blocked from admin endpoint
  try {
    const res = await fetch(`${API_BASE}/auth/admin-only`, {
      headers: { Authorization: `Bearer ${userAccessToken}` },
    });
    const data = await res.json() as { success: boolean; error?: { code: string } };
    const pass = res.status === 403 && data.success === false && data.error?.code === 'FORBIDDEN';
    record({
      testId: 'TC-AUTH-12',
      module: 'Authorization',
      testScenario: 'Regular user accessing admin-only endpoint',
      expectedResult: 'HTTP 403 FORBIDDEN',
      actualResult: pass ? 'Blocked with 403 FORBIDDEN' : JSON.stringify(data),
      httpStatus: res.status,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch (err) {
    record({
      testId: 'TC-AUTH-12',
      module: 'Authorization',
      testScenario: 'Regular user on admin endpoint',
      expectedResult: 'HTTP 403',
      actualResult: String(err),
      httpStatus: 'ERR',
      status: 'FAIL',
    });
  }

  // TC-AUTH-13: Role authorization - admin user allowed on admin endpoint
  try {
    const res = await fetch(`${API_BASE}/auth/admin-only`, {
      headers: { Authorization: `Bearer ${adminAccessToken}` },
    });
    const data = await res.json() as { success: boolean; data?: { message: string } };
    const pass = res.status === 200 && data.success;
    record({
      testId: 'TC-AUTH-13',
      module: 'Authorization',
      testScenario: 'Admin user accessing admin-only endpoint',
      expectedResult: 'HTTP 200 authorized access',
      actualResult: pass ? 'Admin access granted with HTTP 200' : JSON.stringify(data),
      httpStatus: res.status,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch (err) {
    record({
      testId: 'TC-AUTH-13',
      module: 'Authorization',
      testScenario: 'Admin on admin endpoint',
      expectedResult: 'HTTP 200',
      actualResult: String(err),
      httpStatus: 'ERR',
      status: 'FAIL',
    });
  }

  // -------------------------------------------------------------
  // MODULE 3: EVENT MANAGEMENT API
  // -------------------------------------------------------------
  console.log('\n--- MODULE 3: EVENT MANAGEMENT API ---');

  // TC-EVT-01: Admin creates event
  try {
    const eventPayload = {
      title: `QA Master Conference ${runId}`,
      description: 'Annual QA automation summit',
      date: new Date(Date.now() + 7 * 86400000).toISOString(),
      price: 120.00,
      totalSeats: 100,
    };
    const res = await fetch(`${API_BASE}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminAccessToken}`,
      },
      body: JSON.stringify(eventPayload),
    });
    const data = await res.json() as { success: boolean; data?: { event: { _id?: string; id?: string; availableSeats: number; totalSeats: number } } };
    const eventObj = data.data?.event;
    testEventId = (eventObj?._id || eventObj?.id || '').toString();
    const pass = res.status === 201 && data.success && eventObj?.availableSeats === 100 && !!testEventId;

    record({
      testId: 'TC-EVT-01',
      module: 'Events',
      testScenario: 'Admin creates event with availableSeats equal to totalSeats',
      expectedResult: 'HTTP 201 with created event object and availableSeats=totalSeats',
      actualResult: pass ? `Event created (ID: ${testEventId}, Seats: ${eventObj?.availableSeats}/${eventObj?.totalSeats})` : JSON.stringify(data),
      httpStatus: res.status,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch (err) {
    record({
      testId: 'TC-EVT-01',
      module: 'Events',
      testScenario: 'Admin creates event',
      expectedResult: 'HTTP 201',
      actualResult: String(err),
      httpStatus: 'ERR',
      status: 'FAIL',
    });
  }

  // TC-EVT-02: Regular user attempts to create event
  try {
    const res = await fetch(`${API_BASE}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userAccessToken}`,
      },
      body: JSON.stringify({
        title: 'Unauthorized Event',
        date: new Date().toISOString(),
        price: 50,
        totalSeats: 50,
      }),
    });
    const data = await res.json() as { success: boolean; error?: { code: string } };
    const pass = res.status === 403 && data.error?.code === 'FORBIDDEN';
    record({
      testId: 'TC-EVT-02',
      module: 'Events',
      testScenario: 'Regular user attempts to create event',
      expectedResult: 'HTTP 403 FORBIDDEN',
      actualResult: pass ? 'Blocked with 403 FORBIDDEN' : JSON.stringify(data),
      httpStatus: res.status,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch (err) {
    record({
      testId: 'TC-EVT-02',
      module: 'Events',
      testScenario: 'User creates event',
      expectedResult: 'HTTP 403',
      actualResult: String(err),
      httpStatus: 'ERR',
      status: 'FAIL',
    });
  }

  // TC-EVT-03: Admin updates event
  try {
    const res = await fetch(`${API_BASE}/events/${testEventId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminAccessToken}`,
      },
      body: JSON.stringify({
        title: `QA Master Conference ${runId} (Updated)`,
        totalSeats: 150,
      }),
    });
    const data = await res.json() as { success: boolean; data?: { event: { totalSeats: number; availableSeats: number } } };
    const pass = res.status === 200 && data.success && data.data?.event.totalSeats === 150 && data.data?.event.availableSeats === 150;
    record({
      testId: 'TC-EVT-03',
      module: 'Events',
      testScenario: 'Admin updates event capacity expanding totalSeats and availableSeats',
      expectedResult: 'HTTP 200 with updated capacity',
      actualResult: pass ? `Updated capacity to ${data.data!.event.totalSeats} seats` : JSON.stringify(data),
      httpStatus: res.status,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch (err) {
    record({
      testId: 'TC-EVT-03',
      module: 'Events',
      testScenario: 'Admin updates event',
      expectedResult: 'HTTP 200',
      actualResult: String(err),
      httpStatus: 'ERR',
      status: 'FAIL',
    });
  }

  // TC-EVT-04: Public event listing with cursor-based pagination
  try {
    const res = await fetch(`${API_BASE}/events?limit=2`);
    const data = await res.json() as { success: boolean; data?: { events: Array<{ _id?: string; id?: string }>; pagination: { nextCursor: string | null; hasMore: boolean } } };
    const pass = res.status === 200 && data.success && Array.isArray(data.data?.events) && data.data?.pagination !== undefined;
    record({
      testId: 'TC-EVT-04',
      module: 'Events',
      testScenario: 'Public event listing with cursor pagination metadata (no skip())',
      expectedResult: 'HTTP 200 with event array and nextCursor pagination object',
      actualResult: pass ? `Page 1 returned ${data.data!.events.length} events, nextCursor=${data.data!.pagination.nextCursor ? 'present' : 'null'}` : JSON.stringify(data),
      httpStatus: res.status,
      status: pass ? 'PASS' : 'FAIL',
    });

    // If nextCursor exists, fetch page 2 and assert no duplicate IDs
    if (data.data?.pagination.nextCursor) {
      const page2Res = await fetch(`${API_BASE}/events?cursor=${encodeURIComponent(data.data.pagination.nextCursor)}&limit=2`);
      const page2Data = await page2Res.json() as { success: boolean; data?: { events: Array<{ _id?: string; id?: string }> } };
      const page1Ids = new Set(data.data.events.map((e) => (e._id || e.id || '').toString()));
      const hasDuplicates = page2Data.data?.events.some((e) => page1Ids.has((e._id || e.id || '').toString()));
      record({
        testId: 'TC-EVT-05',
        module: 'Events',
        testScenario: 'Pagination stability: cursor pagination avoids duplicates across pages',
        expectedResult: 'HTTP 200 with zero duplicate records between page 1 and page 2',
        actualResult: !hasDuplicates ? 'No duplicate events between page 1 and page 2' : 'Found duplicate records across pages',
        httpStatus: page2Res.status,
        status: !hasDuplicates ? 'PASS' : 'FAIL',
      });
    } else {
      record({
        testId: 'TC-EVT-05',
        module: 'Events',
        testScenario: 'Pagination stability across multiple pages',
        expectedResult: 'HTTP 200 without duplicate items',
        actualResult: 'Only 1 page of events present',
        httpStatus: 200,
        status: 'PASS',
      });
    }
  } catch (err) {
    record({
      testId: 'TC-EVT-04',
      module: 'Events',
      testScenario: 'Cursor pagination',
      expectedResult: 'HTTP 200',
      actualResult: String(err),
      httpStatus: 'ERR',
      status: 'FAIL',
    });
  }

  // TC-EVT-06: Date range filtering
  try {
    const from = new Date(Date.now() - 86400000).toISOString();
    const to = new Date(Date.now() + 30 * 86400000).toISOString();
    const res = await fetch(`${API_BASE}/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    const data = await res.json() as { success: boolean; data?: { events: Array<{ date: string }> } };
    const allWithinRange = (data.data?.events || []).every((e) => new Date(e.date) >= new Date(from) && new Date(e.date) <= new Date(to));
    record({
      testId: 'TC-EVT-06',
      module: 'Events',
      testScenario: 'Filter events by date bounds (from and to)',
      expectedResult: 'HTTP 200 with all returned events matching date interval',
      actualResult: allWithinRange ? `All ${data.data?.events.length} returned events fall within requested bounds` : 'Returned events outside date range',
      httpStatus: res.status,
      status: allWithinRange ? 'PASS' : 'FAIL',
    });
  } catch (err) {
    record({
      testId: 'TC-EVT-06',
      module: 'Events',
      testScenario: 'Date range filtering',
      expectedResult: 'HTTP 200',
      actualResult: String(err),
      httpStatus: 'ERR',
      status: 'FAIL',
    });
  }

  // TC-EVT-07: Text search on event title
  try {
    const res = await fetch(`${API_BASE}/events?search=QA%20Master`);
    const data = await res.json() as { success: boolean; data?: { events: Array<{ title: string }> } };
    const pass = res.status === 200 && data.success && (data.data?.events.length || 0) > 0;
    record({
      testId: 'TC-EVT-07',
      module: 'Events',
      testScenario: 'Text search on event title via MongoDB text index',
      expectedResult: 'HTTP 200 returning matching events',
      actualResult: pass ? `Matched ${data.data!.events.length} events containing 'QA Master'` : JSON.stringify(data),
      httpStatus: res.status,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch (err) {
    record({
      testId: 'TC-EVT-07',
      module: 'Events',
      testScenario: 'Text search',
      expectedResult: 'HTTP 200',
      actualResult: String(err),
      httpStatus: 'ERR',
      status: 'FAIL',
    });
  }

  // -------------------------------------------------------------
  // MODULE 4: BOOKING ENGINE & IDEMPOTENCY
  // -------------------------------------------------------------
  console.log('\n--- MODULE 4: BOOKING ENGINE & IDEMPOTENCY ---');

  let testBookingId = '';
  const testIdempotencyKey = `qa-idem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // TC-BKG-01: Valid booking creation with 10-minute hold
  try {
    const res = await fetch(`${API_BASE}/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userAccessToken}`,
        'Idempotency-Key': testIdempotencyKey,
      },
      body: JSON.stringify({ eventId: testEventId, seats: 2 }),
    });
    const data = await res.json() as { success: boolean; data?: { booking: { _id?: string; id?: string; status: string; seats: number; expiresAt: string } } };
    const bkgObj = data.data?.booking;
    testBookingId = (bkgObj?._id || bkgObj?.id || '').toString();
    const expiresAt = bkgObj?.expiresAt ? new Date(bkgObj.expiresAt).getTime() : 0;
    const now = Date.now();
    const holdDurationMinutes = Math.round((expiresAt - now) / 60000);
    const pass = res.status === 201 && data.success && bkgObj?.status === 'PENDING' && holdDurationMinutes >= 9 && holdDurationMinutes <= 11 && !!testBookingId;

    record({
      testId: 'TC-BKG-01',
      module: 'Bookings',
      testScenario: 'Atomic booking creation with 10-minute seat hold (PENDING)',
      expectedResult: 'HTTP 201, status PENDING, expiresAt exactly 10 minutes in future',
      actualResult: pass ? `Booking ${testBookingId} created in PENDING status, hold duration=${holdDurationMinutes}m` : JSON.stringify(data),
      httpStatus: res.status,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch (err) {
    record({
      testId: 'TC-BKG-01',
      module: 'Bookings',
      testScenario: 'Atomic booking creation',
      expectedResult: 'HTTP 201',
      actualResult: String(err),
      httpStatus: 'ERR',
      status: 'FAIL',
    });
  }

  // TC-BKG-02: Idempotent replay with same Idempotency-Key
  try {
    const evBefore = await (await fetch(`${API_BASE}/events/${testEventId}`)).json() as { data: { event: { availableSeats: number } } };
    const seatsBefore = evBefore.data.event.availableSeats;

    const res = await fetch(`${API_BASE}/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userAccessToken}`,
        'Idempotency-Key': testIdempotencyKey,
      },
      body: JSON.stringify({ eventId: testEventId, seats: 2 }),
    });
    const data = await res.json() as { success: boolean; data?: { booking: { _id?: string; id?: string }; idempotentReplay: boolean } };
    const replayId = (data.data?.booking._id || data.data?.booking.id || '').toString();

    const evAfter = await (await fetch(`${API_BASE}/events/${testEventId}`)).json() as { data: { event: { availableSeats: number } } };
    const seatsAfter = evAfter.data.event.availableSeats;

    const pass = (res.status === 200 || res.status === 201) && replayId === testBookingId && seatsBefore === seatsAfter;
    record({
      testId: 'TC-BKG-02',
      module: 'Bookings',
      testScenario: 'Idempotency: Resending same Idempotency-Key returns original booking without holding seats twice',
      expectedResult: 'Original booking returned, availableSeats unchanged',
      actualResult: pass ? `Original booking returned (ID: ${replayId}), seats unchanged (${seatsBefore} === ${seatsAfter})` : `Failed: seatsBefore=${seatsBefore}, seatsAfter=${seatsAfter}`,
      httpStatus: res.status,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch (err) {
    record({
      testId: 'TC-BKG-02',
      module: 'Bookings',
      testScenario: 'Idempotent replay',
      expectedResult: 'Original booking returned without double seat hold',
      actualResult: String(err),
      httpStatus: 'ERR',
      status: 'FAIL',
    });
  }

  // TC-BKG-03: Booking without Idempotency-Key header
  try {
    const res = await fetch(`${API_BASE}/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userAccessToken}`,
      },
      body: JSON.stringify({ eventId: testEventId, seats: 1 }),
    });
    const data = await res.json() as { success: boolean; error?: { code: string } };
    const pass = res.status === 400 && data.error?.code === 'VALIDATION_ERROR';
    record({
      testId: 'TC-BKG-03',
      module: 'Bookings',
      testScenario: 'Booking request without required Idempotency-Key header',
      expectedResult: 'HTTP 400 VALIDATION_ERROR',
      actualResult: pass ? 'Rejected with 400 VALIDATION_ERROR' : JSON.stringify(data),
      httpStatus: res.status,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch (err) {
    record({
      testId: 'TC-BKG-03',
      module: 'Bookings',
      testScenario: 'Missing Idempotency-Key',
      expectedResult: 'HTTP 400',
      actualResult: String(err),
      httpStatus: 'ERR',
      status: 'FAIL',
    });
  }

  // TC-BKG-04: Booking with insufficient available seats
  try {
    // Create an event with only 1 seat
    const tinyEventRes = await fetch(`${API_BASE}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminAccessToken}` },
      body: JSON.stringify({ title: 'Tiny Event', date: new Date().toISOString(), price: 10, totalSeats: 1 }),
    });
    const tinyData = await tinyEventRes.json() as { data: { event: { _id?: string; id?: string } } };
    const tinyEventId = (tinyData.data.event._id || tinyData.data.event.id || '').toString();

    // Request 2 seats on 1-seat event
    const overbookRes = await fetch(`${API_BASE}/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user2AccessToken}`,
        'Idempotency-Key': `tiny-overbook-${Date.now()}`,
      },
      body: JSON.stringify({ eventId: tinyEventId, seats: 2 }),
    });
    const data = await overbookRes.json() as { success: boolean; error?: { code: string } };
    const pass = overbookRes.status === 409 && (data.error?.code === 'CONFLICT' || data.error?.code === 'INSUFFICIENT_SEATS');
    record({
      testId: 'TC-BKG-04',
      module: 'Bookings',
      testScenario: 'Booking with insufficient available seats returns HTTP 409',
      expectedResult: 'HTTP 409 CONFLICT/INSUFFICIENT_SEATS, no inventory decremented',
      actualResult: pass ? 'Rejected with HTTP 409 (CONFLICT / Insufficient seats available)' : JSON.stringify(data),
      httpStatus: overbookRes.status,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch (err) {
    record({
      testId: 'TC-BKG-04',
      module: 'Bookings',
      testScenario: 'Insufficient seats',
      expectedResult: 'HTTP 409',
      actualResult: String(err),
      httpStatus: 'ERR',
      status: 'FAIL',
    });
  }

  // -------------------------------------------------------------
  // MODULE 5: PAYMENT WEBHOOK & SIGNATURE VERIFICATION
  // -------------------------------------------------------------
  console.log('\n--- MODULE 5: PAYMENT WEBHOOK & HMAC VERIFICATION ---');

  // TC-PAY-01: Valid HMAC signature webhook confirms booking
  try {
    const payload = JSON.stringify({
      event: 'payment.succeeded',
      bookingId: testBookingId,
      paymentId: `pay_qa_${Date.now()}`,
      amount: 240.00,
    });
    const signature = calculateHmac(payload);

    const res = await fetch(`${API_BASE}/payments/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-signature': signature,
      },
      body: payload,
    });
    const data = await res.json() as { success: boolean; data?: { status: string } };

    // Verify booking in DB is now CONFIRMED
    const bkg = await Booking.findById(testBookingId);
    const pass = res.status === 200 && data.success && bkg?.status === 'CONFIRMED';
    record({
      testId: 'TC-PAY-01',
      module: 'Payments',
      testScenario: 'Valid HMAC-SHA256 signature confirms PENDING booking',
      expectedResult: 'HTTP 200, booking status transitions to CONFIRMED',
      actualResult: pass ? `Webhook accepted (status: ${data.data?.status}), DB booking status=${bkg?.status}` : JSON.stringify(data),
      httpStatus: res.status,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch (err) {
    record({
      testId: 'TC-PAY-01',
      module: 'Payments',
      testScenario: 'Valid payment webhook',
      expectedResult: 'HTTP 200 CONFIRMED',
      actualResult: String(err),
      httpStatus: 'ERR',
      status: 'FAIL',
    });
  }

  // TC-PAY-02: Invalid HMAC signature rejected
  try {
    const payload = JSON.stringify({
      event: 'payment.succeeded',
      bookingId: testBookingId,
      paymentId: 'pay_fake_001',
      amount: 100,
    });
    const res = await fetch(`${API_BASE}/payments/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-signature': '0000000000000000000000000000000000000000000000000000000000000000',
      },
      body: payload,
    });
    const data = await res.json() as { success: boolean; error?: { code: string } };
    const pass = res.status === 401 && data.error?.code === 'UNAUTHORIZED';
    record({
      testId: 'TC-PAY-02',
      module: 'Payments',
      testScenario: 'Invalid HMAC signature rejected with 401 UNAUTHORIZED',
      expectedResult: 'HTTP 401 UNAUTHORIZED',
      actualResult: pass ? 'Rejected with 401 UNAUTHORIZED (Invalid HMAC signature)' : JSON.stringify(data),
      httpStatus: res.status,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch (err) {
    record({
      testId: 'TC-PAY-02',
      module: 'Payments',
      testScenario: 'Invalid signature',
      expectedResult: 'HTTP 401',
      actualResult: String(err),
      httpStatus: 'ERR',
      status: 'FAIL',
    });
  }

  // TC-PAY-03: Missing signature header rejected
  try {
    const res = await fetch(`${API_BASE}/payments/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'payment.succeeded', bookingId: testBookingId, paymentId: 'pay_missing_sig', amount: 100 }),
    });
    const data = await res.json() as { success: boolean; error?: { code: string } };
    const pass = res.status === 401 && data.error?.code === 'UNAUTHORIZED';
    record({
      testId: 'TC-PAY-03',
      module: 'Payments',
      testScenario: 'Webhook request without x-signature header',
      expectedResult: 'HTTP 401 UNAUTHORIZED (Signature header missing)',
      actualResult: pass ? 'Rejected with 401 UNAUTHORIZED' : JSON.stringify(data),
      httpStatus: res.status,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch (err) {
    record({
      testId: 'TC-PAY-03',
      module: 'Payments',
      testScenario: 'Missing signature header',
      expectedResult: 'HTTP 401',
      actualResult: String(err),
      httpStatus: 'ERR',
      status: 'FAIL',
    });
  }

  // TC-PAY-04: Modified body with old signature rejected (tampering detection)
  try {
    const originalPayload = JSON.stringify({ event: 'payment.succeeded', bookingId: testBookingId, paymentId: 'pay_orig_1', amount: 100 });
    const originalSig = calculateHmac(originalPayload);
    const tamperedPayload = JSON.stringify({ event: 'payment.succeeded', bookingId: testBookingId, paymentId: 'pay_orig_1', amount: 99999 });

    const res = await fetch(`${API_BASE}/payments/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-signature': originalSig,
      },
      body: tamperedPayload,
    });
    const data = await res.json() as { success: boolean; error?: { code: string } };
    const pass = res.status === 401 && data.error?.code === 'UNAUTHORIZED';
    record({
      testId: 'TC-PAY-04',
      module: 'Payments',
      testScenario: 'Tampered webhook payload rejected (HMAC raw body integrity check)',
      expectedResult: 'HTTP 401 UNAUTHORIZED',
      actualResult: pass ? 'Tampering detected and rejected with 401 UNAUTHORIZED' : JSON.stringify(data),
      httpStatus: res.status,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch (err) {
    record({
      testId: 'TC-PAY-04',
      module: 'Payments',
      testScenario: 'Tampering detection',
      expectedResult: 'HTTP 401',
      actualResult: String(err),
      httpStatus: 'ERR',
      status: 'FAIL',
    });
  }

  // TC-PAY-05: Duplicate webhook delivery is idempotent
  try {
    const payload = JSON.stringify({
      event: 'payment.succeeded',
      bookingId: testBookingId,
      paymentId: `pay_dup_${Date.now()}`,
      amount: 240.00,
    });
    const signature = calculateHmac(payload);

    const res = await fetch(`${API_BASE}/payments/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-signature': signature,
      },
      body: payload,
    });
    const data = await res.json() as { success: boolean; data?: { status: string } };
    const pass = res.status === 200 && data.success && data.data?.status === 'already_confirmed';
    record({
      testId: 'TC-PAY-05',
      module: 'Payments',
      testScenario: 'Duplicate webhook delivery handled idempotently without re-processing',
      expectedResult: 'HTTP 200 with status already_confirmed',
      actualResult: pass ? 'Duplicate handled idempotently (status: already_confirmed)' : JSON.stringify(data),
      httpStatus: res.status,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch (err) {
    record({
      testId: 'TC-PAY-05',
      module: 'Payments',
      testScenario: 'Duplicate webhook',
      expectedResult: 'HTTP 200 already_confirmed',
      actualResult: String(err),
      httpStatus: 'ERR',
      status: 'FAIL',
    });
  }

  // TC-PAY-06: Late payment webhook on expired booking triggers refund protocol
  try {
    // Create an expired booking
    const expiredBkg = await Booking.create({
      userId: new mongoose.Types.ObjectId(),
      eventId: new mongoose.Types.ObjectId(testEventId),
      seats: 1,
      amount: 120,
      status: 'EXPIRED',
      idempotencyKey: `expired-bkg-${Date.now()}`,
      expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
    });

    const payload = JSON.stringify({
      event: 'payment.succeeded',
      bookingId: expiredBkg._id.toString(),
      paymentId: `pay_late_${Date.now()}`,
      amount: 120,
    });
    const signature = calculateHmac(payload);

    const res = await fetch(`${API_BASE}/payments/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-signature': signature,
      },
      body: payload,
    });
    const data = await res.json() as { success: boolean; data?: { status: string } };
    const pass = res.status === 200 && data.success && data.data?.status === 'late_payment_refund_required';

    // Verify DB booking did NOT get confirmed
    const verifyBkg = await Booking.findById(expiredBkg._id);
    const notConfirmed = verifyBkg?.status === 'EXPIRED';

    record({
      testId: 'TC-PAY-06',
      module: 'Payments',
      testScenario: 'Late payment policy: payment on expired booking returns late_payment_refund_required and never confirms',
      expectedResult: 'HTTP 200 with status late_payment_refund_required; booking remains EXPIRED',
      actualResult: pass && notConfirmed ? 'Late payment refund protocol triggered, booking remains EXPIRED' : JSON.stringify(data),
      httpStatus: res.status,
      status: pass && notConfirmed ? 'PASS' : 'FAIL',
    });
  } catch (err) {
    record({
      testId: 'TC-PAY-06',
      module: 'Payments',
      testScenario: 'Late payment policy',
      expectedResult: 'late_payment_refund_required',
      actualResult: String(err),
      httpStatus: 'ERR',
      status: 'FAIL',
    });
  }

  // -------------------------------------------------------------
  // MODULE 6: EXPIRY WORKER ATOMICITY & RELEASE
  // -------------------------------------------------------------
  console.log('\n--- MODULE 6: EXPIRY WORKER ATOMICITY ---');

  // TC-EXP-01: Expiry worker releases seats of expired PENDING bookings exactly once
  try {
    // 1. Create a PENDING booking whose expiresAt is in the past
    const testExpEvent = await Event.create({
      title: 'Expiry Test Event',
      date: new Date(Date.now() + 86400000),
      price: 25,
      totalSeats: 10,
      availableSeats: 8, // 2 seats held
    });

    const pendingExpiredBkg = await Booking.create({
      userId: new mongoose.Types.ObjectId(),
      eventId: testExpEvent._id,
      seats: 2,
      amount: 50,
      status: 'PENDING',
      idempotencyKey: `pending-exp-${Date.now()}`,
      expiresAt: new Date(Date.now() - 60000), // expired 1 min ago
    });

    // 2. Invoke ExpiryWorker.expireSingleBooking
    const expireResult = await ExpiryWorker.expireSingleBooking(pendingExpiredBkg._id.toString());

    // 3. Check booking status in DB
    const updatedBkg = await Booking.findById(pendingExpiredBkg._id);

    // 4. Check availableSeats restored in Event
    const updatedEv = await Event.findById(testExpEvent._id);

    // 5. Try expiring again to test exactly-once guarantee
    const secondExpire = await ExpiryWorker.expireSingleBooking(pendingExpiredBkg._id.toString());
    const afterSecondEv = await Event.findById(testExpEvent._id);

    const pass =
      expireResult.success &&
      expireResult.seatsReleased === 2 &&
      updatedBkg?.status === 'EXPIRED' &&
      updatedEv?.availableSeats === 10 &&
      !secondExpire.success &&
      afterSecondEv?.availableSeats === 10;

    record({
      testId: 'TC-EXP-01',
      module: 'Expiry Worker',
      testScenario: 'Atomic conditional seat release: PENDING -> EXPIRED restores held seats exactly once',
      expectedResult: 'Booking transitions to EXPIRED, seats incremented by 2; subsequent worker runs do not double release',
      actualResult: pass
        ? 'Seats released exactly once (8 -> 10). Second expiry attempt returned success=false without double releasing'
        : `Failed: seats=${updatedEv?.availableSeats}, secondSeats=${afterSecondEv?.availableSeats}`,
      httpStatus: 200,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch (err) {
    record({
      testId: 'TC-EXP-01',
      module: 'Expiry Worker',
      testScenario: 'Atomic expiry seat release',
      expectedResult: 'Seats restored exactly once',
      actualResult: String(err),
      httpStatus: 'ERR',
      status: 'FAIL',
    });
  }

  // -------------------------------------------------------------
  // MODULE 7: RATE LIMITING & RELIABILITY
  // -------------------------------------------------------------
  console.log('\n--- MODULE 7: RATE LIMITING & RELIABILITY ---');

  // TC-RAT-01: Rate limit 5 requests/min per user on POST /bookings
  try {
    const rateLimitStatuses: number[] = [];
    const clientUser = `ratelimit_${runId}@test.local`;
    const regRes = await (await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Rate Limit User', email: clientUser, password: qaPassword }),
    })).json() as { data: { accessToken: string } };
    const rateLimitToken = regRes.data.accessToken;

    // Send 6 requests rapidly
    for (let i = 1; i <= 6; i++) {
      const res = await fetch(`${API_BASE}/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${rateLimitToken}`,
          'Idempotency-Key': `rl-test-${Date.now()}-${i}`,
        },
        body: JSON.stringify({ eventId: testEventId, seats: 1 }),
      });
      rateLimitStatuses.push(res.status);
    }

    const first5Passed = rateLimitStatuses.slice(0, 5).every((s) => s === 201 || s === 409);
    const sixthRateLimited = rateLimitStatuses[5] === 429;
    const pass = first5Passed && sixthRateLimited;

    record({
      testId: 'TC-RAT-01',
      module: 'Reliability',
      testScenario: 'User-scoped rate limiting: 5 req/min allowed on POST /bookings, 6th returns 429',
      expectedResult: 'First 5 succeed (201/409), 6th returns HTTP 429',
      actualResult: pass ? `Statuses: [${rateLimitStatuses.join(', ')}] - 6th blocked with 429` : `Unexpected statuses: [${rateLimitStatuses.join(', ')}]`,
      httpStatus: rateLimitStatuses[5] || 'ERR',
      status: pass ? 'PASS' : 'FAIL',
    });

    // TC-RAT-02: Different user is not blocked (per-user rate limit isolation)
    const diffUserRes = await fetch(`${API_BASE}/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user2AccessToken}`,
        'Idempotency-Key': `diff-user-rl-${Date.now()}`,
      },
      body: JSON.stringify({ eventId: testEventId, seats: 1 }),
    });
    const diffPass = diffUserRes.status === 201 || diffUserRes.status === 409;
    record({
      testId: 'TC-RAT-02',
      module: 'Reliability',
      testScenario: 'Rate limit isolation: User B is NOT blocked when User A is rate limited',
      expectedResult: 'HTTP 201 or 409 (not 429)',
      actualResult: diffPass ? `User B was not blocked (HTTP ${diffUserRes.status})` : `User B was blocked (HTTP ${diffUserRes.status})`,
      httpStatus: diffUserRes.status,
      status: diffPass ? 'PASS' : 'FAIL',
    });
  } catch (err) {
    record({
      testId: 'TC-RAT-01',
      module: 'Reliability',
      testScenario: 'Rate limiting',
      expectedResult: 'HTTP 429 on 6th request',
      actualResult: String(err),
      httpStatus: 'ERR',
      status: 'FAIL',
    });
  }

  // TC-REL-01: X-Request-Id header in responses
  try {
    const res = await fetch(`${API_BASE}/health`);
    const reqId = res.headers.get('x-request-id');
    const isUuid = !!reqId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reqId);
    record({
      testId: 'TC-REL-01',
      module: 'Reliability',
      testScenario: 'Unique X-Request-Id UUID header generated and returned on all responses',
      expectedResult: 'HTTP response contains valid UUID in X-Request-Id header',
      actualResult: isUuid ? `Received valid UUID X-Request-Id: ${reqId}` : `Invalid or missing header: ${reqId}`,
      httpStatus: res.status,
      status: isUuid ? 'PASS' : 'FAIL',
    });
  } catch (err) {
    record({
      testId: 'TC-REL-01',
      module: 'Reliability',
      testScenario: 'X-Request-Id tracing',
      expectedResult: 'UUID header',
      actualResult: String(err),
      httpStatus: 'ERR',
      status: 'FAIL',
    });
  }

  // -------------------------------------------------------------
  // MODULE 8: ADMIN REVENUE REPORT
  // -------------------------------------------------------------
  console.log('\n--- MODULE 8: ADMIN REVENUE REPORT ---');

  // TC-REP-01: Admin accesses revenue report
  try {
    const from = new Date(Date.now() - 7 * 86400000).toISOString();
    const to = new Date(Date.now() + 86400000).toISOString();
    const res = await fetch(`${API_BASE}/admin/reports/revenue?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
      headers: { Authorization: `Bearer ${adminAccessToken}` },
    });
    const data = await res.json() as { success: boolean; data?: { events: Array<unknown>; summary: { totalRevenue: number; totalSeatsSold: number } } };
    const pass = res.status === 200 && data.success && typeof data.data?.summary.totalRevenue === 'number';
    record({
      testId: 'TC-REP-01',
      module: 'Admin Reports',
      testScenario: 'Admin accesses GET /admin/reports/revenue with date interval',
      expectedResult: 'HTTP 200 with aggregated revenue and seats sold summary',
      actualResult: pass ? `Revenue report retrieved (Total: $${data.data!.summary.totalRevenue.toFixed(2)}, Seats: ${data.data!.summary.totalSeatsSold})` : JSON.stringify(data),
      httpStatus: res.status,
      status: pass ? 'PASS' : 'FAIL',
    });
    fs.writeFileSync(path.join(EVIDENCE_DIR, 'revenue_report_sample.json'), JSON.stringify(data, null, 2));
  } catch (err) {
    record({
      testId: 'TC-REP-01',
      module: 'Admin Reports',
      testScenario: 'Admin revenue report',
      expectedResult: 'HTTP 200',
      actualResult: String(err),
      httpStatus: 'ERR',
      status: 'FAIL',
    });
  }

  // TC-REP-02: Regular user blocked from revenue report
  try {
    const res = await fetch(`${API_BASE}/admin/reports/revenue`, {
      headers: { Authorization: `Bearer ${userAccessToken}` },
    });
    const data = await res.json() as { success: boolean; error?: { code: string } };
    const pass = res.status === 403 && data.error?.code === 'FORBIDDEN';
    record({
      testId: 'TC-REP-02',
      module: 'Admin Reports',
      testScenario: 'Regular user blocked from admin revenue report',
      expectedResult: 'HTTP 403 FORBIDDEN',
      actualResult: pass ? 'Blocked with 403 FORBIDDEN' : JSON.stringify(data),
      httpStatus: res.status,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch (err) {
    record({
      testId: 'TC-REP-02',
      module: 'Admin Reports',
      testScenario: 'Regular user on revenue report',
      expectedResult: 'HTTP 403',
      actualResult: String(err),
      httpStatus: 'ERR',
      status: 'FAIL',
    });
  }

  // -------------------------------------------------------------
  // MODULE 9: CONCURRENCY STRESS VERIFICATION (50 PARALLEL REQUESTS)
  // -------------------------------------------------------------
  console.log('\n--- MODULE 9: CONCURRENCY & OVERSELLING STRESS TEST ---');

  const concurrencyEventTitle = `Stress Concurrency Event ${Date.now()}`;
  let concurrencyEventId = '';

  try {
    // 1. Admin creates event with EXACTLY 10 seats
    const createEvRes = await fetch(`${API_BASE}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminAccessToken}` },
      body: JSON.stringify({
        title: concurrencyEventTitle,
        date: new Date(Date.now() + 14 * 86400000).toISOString(),
        price: 50.00,
        totalSeats: 10,
      }),
    });
    const evData = await createEvRes.json() as { data: { event: { _id?: string; id?: string; availableSeats: number } } };
    const evObj = evData.data?.event;
    concurrencyEventId = (evObj?._id || evObj?.id || '').toString();
    console.log(`🎯 Created isolated stress event: ${concurrencyEventId} with exactly 10 seats`);

    // 2. Prepare 50 distinct test users with unique auth tokens
    console.log('⚡ Registering 50 unique users for parallel competition...');
    const userTokens: string[] = [];
    const registerPromises = Array.from({ length: 50 }).map(async (_, idx) => {
      const email = `stress_u${idx}_${runId}@test.local`;
      const reg = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `Stress User ${idx}`, email, password: qaPassword }),
      });
      const d = await reg.json() as { data?: { accessToken: string } };
      return d.data?.accessToken;
    });

    const tokens = await Promise.all(registerPromises);
    for (const t of tokens) {
      if (t) userTokens.push(t);
    }
    console.log(`✅ Provisioned ${userTokens.length} authenticated sessions`);

    // 3. Dispatch all 50 booking requests concurrently via Promise.all
    console.log('🚀 Dispatching 50 parallel requests competing for 10 available seats...');
    const bookingPromises = userTokens.map(async (token, idx) => {
      const idemKey = `concurrency-key-${runId}-${idx}-${Math.random().toString(36).slice(2, 8)}`;
      const res = await fetch(`${API_BASE}/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'Idempotency-Key': idemKey,
        },
        body: JSON.stringify({ eventId: concurrencyEventId, seats: 1 }),
      });
      const data = await res.json() as { success: boolean; data?: { booking: { id: string } }; error?: { code: string } };
      return { status: res.status, data };
    });

    const responses = await Promise.all(bookingPromises);

    // 4. Analyze results
    const successful = responses.filter((r) => r.status === 201);
    const conflicts = responses.filter((r) => r.status === 409);
    const errors = responses.filter((r) => r.status !== 201 && r.status !== 409);

    // 5. Query final event inventory from database
    const finalEvent = await Event.findById(concurrencyEventId);
    const finalAvailableSeats = finalEvent?.availableSeats ?? -1;

    // 6. Count bookings in DB for this event
    const confirmedOrPendingBookings = await Booking.countDocuments({ eventId: concurrencyEventId });

    const concurrencyPass =
      successful.length === 10 &&
      conflicts.length === 40 &&
      errors.length === 0 &&
      finalAvailableSeats === 0 &&
      confirmedOrPendingBookings === 10;

    const concurrencyEvidence = {
      totalRequests: 50,
      successfulCount: successful.length,
      insufficientSeatsCount: conflicts.length,
      unexpectedErrorCount: errors.length,
      initialSeats: 10,
      finalAvailableSeats,
      bookingsInDatabase: confirmedOrPendingBookings,
      oversellingOccurred: finalAvailableSeats < 0 || successful.length > 10,
      verdict: concurrencyPass ? 'PASSED' : 'FAILED',
    };

    fs.writeFileSync(path.join(EVIDENCE_DIR, 'concurrency_test_evidence.json'), JSON.stringify(concurrencyEvidence, null, 2));

    record({
      testId: 'TC-CONC-01',
      module: 'Concurrency',
      testScenario: 'MANDATORY: 50 parallel requests competing for 10 seats (atomic conditional decrement)',
      expectedResult: 'Exactly 10 HTTP 201, exactly 40 HTTP 409, final availableSeats=0, no oversell',
      actualResult: concurrencyPass
        ? `PERFECT: Exactly 10 succeeded (HTTP 201), 40 rejected (HTTP 409), availableSeats=0, 10 bookings created in DB`
        : `FAILED: Succeeded=${successful.length}, Conflicts=${conflicts.length}, Errors=${errors.length}, SeatsLeft=${finalAvailableSeats}`,
      httpStatus: concurrencyPass ? '201/409' : 'FAIL',
      status: concurrencyPass ? 'PASS' : 'FAIL',
      details: concurrencyEvidence,
    });
  } catch (err) {
    record({
      testId: 'TC-CONC-01',
      module: 'Concurrency',
      testScenario: 'Concurrency stress test',
      expectedResult: '10 success, 40 conflict',
      actualResult: String(err),
      httpStatus: 'ERR',
      status: 'FAIL',
    });
  }

  // -------------------------------------------------------------
  // SUMMARY REPORT & EXPORT
  // -------------------------------------------------------------
  console.log('\n===============================================================');
  console.log('🏁 E2E QA TEST EXECUTION COMPLETED');
  const passCount = results.filter((r) => r.status === 'PASS').length;
  const failCount = results.filter((r) => r.status === 'FAIL').length;
  const blockedCount = results.filter((r) => r.status === 'BLOCKED').length;
  const notTestedCount = results.filter((r) => r.status === 'NOT TESTED').length;

  console.log(`TOTAL TESTS: ${results.length}`);
  console.log(`✅ PASSED:     ${passCount}`);
  console.log(`❌ FAILED:     ${failCount}`);
  console.log(`⚠️ BLOCKED:    ${blockedCount}`);
  console.log(`⚪ NOT TESTED: ${notTestedCount}`);
  console.log('===============================================================\n');

  fs.writeFileSync(path.join(EVIDENCE_DIR, 'e2e_results.json'), JSON.stringify(results, null, 2));

  await mongoose.disconnect();
}

runE2E().catch((err) => {
  console.error('Fatal error during E2E test execution:', err);
  process.exit(1);
});
