import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app';
import { User, RefreshToken } from '../src/models';

const TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/ticket_booking_auth_test';
const app = createApp();

beforeAll(async () => {
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
  await Promise.all([User.syncIndexes(), RefreshToken.syncIndexes()]);
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), RefreshToken.deleteMany({})]);
});

describe('Authentication API Suite', () => {
  const testUser = {
    name: 'Alice Johnson',
    email: 'alice@example.com',
    password: 'Password123!',
    role: 'user' as const
  };

  describe('POST /auth/register', () => {
    it('should successfully register a user and return tokens and sanitized user', async () => {
      const res = await request(app).post('/auth/register').send(testUser);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(testUser.email);
      expect(res.body.data.user.name).toBe(testUser.name);
      expect(res.body.data.user.role).toBe('user');
      expect(res.body.data.user.passwordHash).toBeUndefined();
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();

      // Ensure httpOnly cookie is set
      const cookies = res.headers['set-cookie'] as string[] | undefined;
      expect(cookies).toBeDefined();
      expect(cookies?.[0]).toMatch(/refreshToken=/);
      expect(cookies?.[0]).toMatch(/HttpOnly/);
    });

    it('should reject registration with duplicate email with 409 Conflict', async () => {
      await request(app).post('/auth/register').send(testUser);
      const res = await request(app).post('/auth/register').send(testUser);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('should reject registration with invalid password length (under 8 chars)', async () => {
      const res = await request(app).post('/auth/register').send({
        ...testUser,
        password: '123'
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await request(app).post('/auth/register').send(testUser);
    });

    it('should successfully login and issue tokens', async () => {
      const res = await request(app).post('/auth/login').send({
        email: testUser.email,
        password: testUser.password
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(testUser.email);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
    });

    it('should reject login with wrong password', async () => {
      const res = await request(app).post('/auth/login').send({
        email: testUser.email,
        password: 'WrongPassword999!'
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject login for non-existent email', async () => {
      const res = await request(app).post('/auth/login').send({
        email: 'doesnotexist@example.com',
        password: 'Password123!'
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /auth/me (Authentication Middleware)', () => {
    let accessToken: string;

    beforeEach(async () => {
      const reg = await request(app).post('/auth/register').send(testUser);
      accessToken = reg.body.data.accessToken;
    });

    it('should return user info when valid access token is provided', async () => {
      const res = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(testUser.email);
    });

    it('should reject request without Authorization header', async () => {
      const res = await request(app).get('/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject request with invalid/malformed token', async () => {
      const res = await request(app)
        .get('/auth/me')
        .set('Authorization', 'Bearer invalid.token.payload');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject expired access token with 401 and descriptive message', async () => {
      const jwt = require('jsonwebtoken');
      const expiredToken = jwt.sign(
        { userId: new mongoose.Types.ObjectId().toString(), email: 'expired@test.com', role: 'user' },
        process.env.JWT_SECRET || 'super_secret_jwt_key_at_least_32_characters_long',
        { expiresIn: '-1s' }
      );

      const res = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/expired/i);
    });
  });

  describe('Role-Based Authorization Middleware (requireAdmin)', () => {
    let regularUserToken: string;
    let adminUserToken: string;

    beforeEach(async () => {
      const regularRes = await request(app).post('/auth/register').send({
        name: 'Regular Bob',
        email: 'bob@example.com',
        password: 'Password123!',
        role: 'user'
      });
      regularUserToken = regularRes.body.data.accessToken;

      const adminRes = await request(app).post('/auth/register').send({
        name: 'Admin Boss',
        email: 'admin@example.com',
        password: 'Password123!',
        role: 'admin'
      });
      adminUserToken = adminRes.body.data.accessToken;
    });

    it('should permit admin user accessing admin-only endpoint with 200 OK', async () => {
      const res = await request(app)
        .get('/auth/admin-only')
        .set('Authorization', `Bearer ${adminUserToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Welcome Admin');
    });

    it('should reject regular user accessing admin-only endpoint with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/auth/admin-only')
        .set('Authorization', `Bearer ${regularUserToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('POST /auth/refresh & Rotation Security', () => {
    let initialRefreshToken: string;
    let initialAccessToken: string;

    beforeEach(async () => {
      const reg = await request(app).post('/auth/register').send(testUser);
      initialRefreshToken = reg.body.data.refreshToken;
      initialAccessToken = reg.body.data.accessToken;
    });

    it('should rotate refresh token and issue new token pair', async () => {
      const res = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: initialRefreshToken });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.refreshToken).not.toBe(initialRefreshToken);
      expect(res.body.data.accessToken).not.toBe(initialAccessToken);

      // The new refresh token should be usable for another refresh
      const nextRes = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: res.body.data.refreshToken });

      expect(nextRes.status).toBe(200);
      expect(nextRes.body.success).toBe(true);
    });

    it('should detect reuse of consumed refresh token and revoke all sessions for that user', async () => {
      // Step 1: Normal refresh rotates initialRefreshToken -> produces newRefreshToken
      const firstRefresh = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: initialRefreshToken });

      expect(firstRefresh.status).toBe(200);
      const newRefreshToken = firstRefresh.body.data.refreshToken;

      // Step 2: Malicious / replay attack: Attacker attempts to use initialRefreshToken again!
      const reuseAttempt = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: initialRefreshToken });

      expect(reuseAttempt.status).toBe(401);
      expect(reuseAttempt.body.success).toBe(false);
      expect(reuseAttempt.body.error.message).toMatch(/reuse detected/i);

      // Step 3: Verify that because of the reuse breach, ALL sessions belonging to this user are revoked
      const subsequentRefresh = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: newRefreshToken });

      expect(subsequentRefresh.status).toBe(401);
      expect(subsequentRefresh.body.success).toBe(false);
    });

    it('should refresh using cookie if body is omitted', async () => {
      const loginRes = await request(app).post('/auth/login').send({
        email: testUser.email,
        password: testUser.password
      });

      const cookies = (loginRes.headers['set-cookie'] as string[] | undefined) ?? [];

      const res = await request(app)
        .post('/auth/refresh')
        .set('Cookie', cookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
    });
  });

  describe('POST /auth/logout', () => {
    it('should revoke the refresh token and clear cookie on logout', async () => {
      const loginRes = await request(app).post('/auth/register').send(testUser);
      const refreshToken = loginRes.body.data.refreshToken;

      const logoutRes = await request(app)
        .post('/auth/logout')
        .send({ refreshToken });

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.success).toBe(true);

      // Attempting to refresh with the revoked token must fail
      const refreshRes = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken });

      expect(refreshRes.status).toBe(401);
    });
  });
});
