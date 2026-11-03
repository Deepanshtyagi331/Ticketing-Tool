import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app';
import { User, Event, Booking, RefreshToken } from '../src/models';
import { computeHmac } from '../src/utils/hmac';
import { env } from '../src/config/env';
import { signAccessToken } from '../src/utils/jwt';

const TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/ticket_booking_stress_test';
const app = createApp();

beforeAll(async () => {
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
  await Promise.all([
    User.syncIndexes(),
    Event.syncIndexes(),
    Booking.syncIndexes(),
    RefreshToken.syncIndexes()
  ]);
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    Event.deleteMany({}),
    Booking.deleteMany({}),
    RefreshToken.deleteMany({})
  ]);
});

describe('Master Stress & Assignment Verification Suite', () => {
  /**
   * TEST 1 — CONCURRENCY (50 Parallel Requests competing for 10 Seats)
   */
  describe('TEST 1 — CONCURRENCY (50 Parallel Requests competing for 10 Seats)', () => {
    it('should successfully book exactly 10 seats, reject 40 with 409, leave availableSeats at 0, with zero server errors', async () => {
      // 1. Create an event with exactly 10 available seats
      const event = await Event.create({
        title: 'Exclusive Intimate VIP Concert',
        date: new Date(Date.now() + 7 * 86400000),
        price: 250,
        totalSeats: 10,
        availableSeats: 10
      });
      const eventId = event._id.toString();

      // 2. Provision 50 distinct users and generate their authenticated session tokens
      const userDocs = [];
      for (let i = 1; i <= 50; i++) {
        userDocs.push({
          name: `Stress User ${i}`,
          email: `stress_user_${i}@example.com`,
          passwordHash: 'dummy_hash',
          role: 'user' as const
        });
      }
      const createdUsers = await User.insertMany(userDocs);

      const userTokens = createdUsers.map((u) =>
        signAccessToken({
          userId: u._id.toString(),
          email: u.email,
          role: u.role
        })
      );

      // 3. Dispatch 50 parallel booking requests simultaneously
      const parallelRequests = userTokens.map((token, index) => {
        const idempotencyKey = `stress-concurrency-key-${index + 1}-${crypto.randomUUID()}`;
        return request(app)
          .post('/bookings')
          .set('Authorization', `Bearer ${token}`)
          .set('Idempotency-Key', idempotencyKey)
          .send({ eventId, seats: 1 });
      });

      const responses = await Promise.all(parallelRequests);

      // 4. Verify outcomes across all 50 parallel requests
      const successfulBookings = responses.filter((r) => r.status === 201);
      const insufficientInventoryRejections = responses.filter((r) => r.status === 409);
      const serverErrors = responses.filter((r) => r.status >= 500);
      const clientErrors = responses.filter((r) => r.status !== 201 && r.status !== 409);

      // Verifications:
      // Exactly 10 successful bookings
      expect(successfulBookings.length).toBe(10);

      // Exactly 40 unsuccessful bookings due to insufficient inventory
      expect(insufficientInventoryRejections.length).toBe(40);

      // No unexpected server errors
      expect(serverErrors.length).toBe(0);
      expect(clientErrors.length).toBe(0);

      // 5. Verify database integrity
      // availableSeats must equal 0
      const finalEvent = await Event.findById(eventId);
      expect(finalEvent?.availableSeats).toBe(0);
      expect(finalEvent?.totalSeats).toBe(10);

      // Exactly 10 booking records must exist in database
      const bookingsInDb = await Booking.find({ eventId });
      expect(bookingsInDb.length).toBe(10);

      // All 10 bookings must be unique users with status PENDING
      const distinctUsers = new Set(bookingsInDb.map((b) => b.userId.toString()));
      expect(distinctUsers.size).toBe(10);

      for (const b of bookingsInDb) {
        expect(b.status).toBe('PENDING');
        expect(b.seats).toBe(1);
        expect(b.amount).toBe(250);
      }
    }, 30000); // 30s timeout for parallel load
  });

  /**
   * TEST 2 — WEBHOOK IDEMPOTENCY
   */
  describe('TEST 2 — WEBHOOK IDEMPOTENCY', () => {
    it('should confirm booking only once and avoid duplicating financial records upon repeated webhook calls', async () => {
      // Create user & event
      const user = await User.create({
        name: 'Webhook User',
        email: 'webhook_test@example.com',
        passwordHash: 'dummy_hash',
        role: 'user'
      });

      const event = await Event.create({
        title: 'Idempotency Gala',
        date: new Date(Date.now() + 10 * 86400000),
        price: 120,
        totalSeats: 50,
        availableSeats: 48
      });

      // Create a pending booking
      const booking = await Booking.create({
        userId: user._id,
        eventId: event._id,
        seats: 2,
        amount: 240,
        status: 'PENDING',
        idempotencyKey: 'wh-idemp-001',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
      });

      const payload = {
        event: 'payment.succeeded',
        bookingId: booking._id.toString(),
        paymentId: 'stripe_charge_xyz_789',
        amount: 240
      };

      const rawJson = JSON.stringify(payload);
      const signature = computeHmac(rawJson, env.PAYMENT_WEBHOOK_SECRET);

      // 1. Submit valid payment webhook
      const firstRes = await request(app)
        .post('/payments/webhook')
        .set('x-signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawJson);

      expect(firstRes.status).toBe(200);
      expect(firstRes.body.data.status).toBe('confirmed');

      // Verify booking is now CONFIRMED
      const bookingAfterFirst = await Booking.findById(booking._id);
      expect(bookingAfterFirst?.status).toBe('CONFIRMED');

      // 2. Submit the identical webhook again
      const secondRes = await request(app)
        .post('/payments/webhook')
        .set('x-signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawJson);

      expect(secondRes.status).toBe(200);
      expect(secondRes.body.data.status).toBe('already_confirmed');

      // 3. Verify that the booking is confirmed only once and no duplicate bookings exist
      const totalBookings = await Booking.countDocuments({ _id: booking._id });
      expect(totalBookings).toBe(1);

      const allConfirmed = await Booking.find({ status: 'CONFIRMED' });
      expect(allConfirmed.length).toBe(1);
      expect(allConfirmed[0]?.amount).toBe(240);
    });
  });

  /**
   * TEST 3 — REFRESH TOKEN REUSE
   */
  describe('TEST 3 — REFRESH TOKEN REUSE & SESSION REVOCATION', () => {
    it('should login, refresh successfully, and upon reusing the old token, invalidate ALL sessions for that user', async () => {
      // 1. Register user
      const registerRes = await request(app).post('/auth/register').send({
        name: 'Session Security User',
        email: 'session_sec@example.com',
        password: 'Password123!',
        role: 'user'
      });

      const initialRefreshToken = registerRes.body.data.refreshToken;
      expect(initialRefreshToken).toBeDefined();

      // 2. Refresh the token successfully
      const refreshRes = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: initialRefreshToken });

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.success).toBe(true);

      const newRefreshToken = refreshRes.body.data.refreshToken;
      expect(newRefreshToken).toBeDefined();
      expect(newRefreshToken).not.toBe(initialRefreshToken);

      // 3. Reuse the old refresh token (simulating replay / token theft attack)
      const reuseRes = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: initialRefreshToken });

      // Must be rejected with 401 Unauthorized
      expect(reuseRes.status).toBe(401);
      expect(reuseRes.body.success).toBe(false);
      expect(reuseRes.body.error.message).toMatch(/reuse detected/i);

      // 4. Verify that ALL user sessions are invalidated:
      // Even the newly rotated valid token must now be revoked!
      const subsequentRes = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: newRefreshToken });

      expect(subsequentRes.status).toBe(401);
      expect(subsequentRes.body.success).toBe(false);

      // Verify in database: All refresh tokens for this user must have isRevoked = true
      const userTokensInDb = await RefreshToken.find({
        userId: registerRes.body.data.user.id
      });
      expect(userTokensInDb.length).toBeGreaterThanOrEqual(2);
      for (const t of userTokensInDb) {
        expect(t.isRevoked).toBe(true);
      }
    });
  });
});
