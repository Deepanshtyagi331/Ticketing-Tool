import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app';
import { User, Event, Booking } from '../src/models';

const TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/ticket_booking_reports_test';
const app = createApp();

let adminToken: string;
let userToken: string;
let otherUserToken: string;
let eventId1: string;
let eventId2: string;

beforeAll(async () => {
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
  await Promise.all([User.syncIndexes(), Event.syncIndexes(), Booking.syncIndexes()]);

  // Admin
  const adminRes = await request(app).post('/auth/register').send({
    name: 'Admin Boss',
    email: 'admin_reports@example.com',
    password: 'Password123!',
    role: 'admin'
  });
  adminToken = adminRes.body.data.accessToken;

  // Regular user 1
  const user1Res = await request(app).post('/auth/register').send({
    name: 'User One',
    email: 'user1_reports@example.com',
    password: 'Password123!',
    role: 'user'
  });
  userToken = user1Res.body.data.accessToken;

  // Regular user 2
  const user2Res = await request(app).post('/auth/register').send({
    name: 'User Two',
    email: 'user2_reports@example.com',
    password: 'Password123!',
    role: 'user'
  });
  otherUserToken = user2Res.body.data.accessToken;
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

beforeEach(async () => {
  await Booking.deleteMany({});
  await Event.deleteMany({});

  const e1 = await Event.create({
    title: 'Rock Concert 2026',
    date: new Date('2026-06-15T20:00:00.000Z'),
    price: 100,
    totalSeats: 1000,
    availableSeats: 1000
  });
  eventId1 = e1._id.toString();

  const e2 = await Event.create({
    title: 'Ballet Gala',
    date: new Date('2026-06-16T19:00:00.000Z'),
    price: 50,
    totalSeats: 500,
    availableSeats: 500
  });
  eventId2 = e2._id.toString();
});

describe('Reliability, Logging, Rate Limiting & Revenue Report Suite', () => {
  describe('PART B: Request ID & Error Consistency', () => {
    it('should generate and return X-Request-Id header in responses', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['x-request-id']).toBeDefined();
      expect(String(res.headers['x-request-id']).length).toBeGreaterThanOrEqual(16);
    });

    it('should preserve and echo client-provided X-Request-Id header', async () => {
      const customId = 'client-custom-req-id-uuid-999';
      const res = await request(app).get('/health').set('X-Request-Id', customId);
      expect(res.headers['x-request-id']).toBe(customId);
    });

    it('should maintain consistent error response format on 404', async () => {
      const res = await request(app).get('/api/unknown-endpoint');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toHaveProperty('code');
      expect(res.body.error).toHaveProperty('message');
    });
  });

  describe('PART C: Rate Limiting (POST /bookings)', () => {
    it('should enforce user-scoped rate limit of 5 requests per minute, returning 429 on 6th request', async () => {
      // 5 allowed requests
      for (let i = 1; i <= 5; i++) {
        const res = await request(app)
          .post('/bookings')
          .set('Authorization', `Bearer ${userToken}`)
          .set('Idempotency-Key', `rate-test-key-${i}`)
          .send({ eventId: eventId1, seats: 1 });

        expect(res.status).toBe(201);
      }

      // 6th request from SAME user should trigger 429
      const sixthRes = await request(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .set('Idempotency-Key', 'rate-test-key-6')
        .send({ eventId: eventId1, seats: 1 });

      expect(sixthRes.status).toBe(429);
      expect(sixthRes.body.success).toBe(false);
      expect(sixthRes.body.error.code).toBe('TOO_MANY_REQUESTS');
      expect(sixthRes.body.error.message).toMatch(/too many booking requests/i);

      // BUT a DIFFERENT user should NOT be blocked (proves user-scoped limit, not global IP alone)
      const otherUserRes = await request(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${otherUserToken}`)
        .set('Idempotency-Key', 'rate-test-other-user')
        .send({ eventId: eventId1, seats: 1 });

      expect(otherUserRes.status).toBe(201);
    });
  });

  describe('PART D: Admin Revenue Report (GET /admin/reports/revenue)', () => {
    const from = '2026-06-01T00:00:00.000Z';
    const to = '2026-06-30T23:59:59.999Z';

    it('should reject unauthorized access from regular users with 403 Forbidden', async () => {
      const res = await request(app)
        .get(`/admin/reports/revenue?from=${from}&to=${to}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should reject unauthenticated access with 401 Unauthorized', async () => {
      const res = await request(app).get(`/admin/reports/revenue?from=${from}&to=${to}`);
      expect(res.status).toBe(401);
    });

    it('should return empty report when no confirmed bookings exist in date range', async () => {
      const res = await request(app)
        .get(`/admin/reports/revenue?from=${from}&to=${to}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.report).toEqual([]);
      expect(res.body.data.summary.totalRevenue).toBe(0);
      expect(res.body.data.summary.totalBookings).toBe(0);
      expect(res.body.data.summary.totalSeats).toBe(0);
    });

    it('should accurately aggregate confirmed revenue by event per day and exclude pending/expired bookings', async () => {
      // Seed Confirmed Bookings within June 2026:
      // Event 1 on June 10: 2 bookings ($200 and $100) -> total $300, 3 seats
      await Booking.create({
        userId: new mongoose.Types.ObjectId(),
        eventId: new mongoose.Types.ObjectId(eventId1),
        seats: 2,
        amount: 200,
        status: 'CONFIRMED',
        idempotencyKey: 'seed-c1',
        expiresAt: new Date('2026-06-10T12:00:00Z'),
        createdAt: new Date('2026-06-10T10:00:00Z')
      });

      await Booking.create({
        userId: new mongoose.Types.ObjectId(),
        eventId: new mongoose.Types.ObjectId(eventId1),
        seats: 1,
        amount: 100,
        status: 'CONFIRMED',
        idempotencyKey: 'seed-c2',
        expiresAt: new Date('2026-06-10T14:00:00Z'),
        createdAt: new Date('2026-06-10T11:00:00Z')
      });

      // Event 2 on June 12: 1 booking ($150, 3 seats)
      await Booking.create({
        userId: new mongoose.Types.ObjectId(),
        eventId: new mongoose.Types.ObjectId(eventId2),
        seats: 3,
        amount: 150,
        status: 'CONFIRMED',
        idempotencyKey: 'seed-c3',
        expiresAt: new Date('2026-06-12T15:00:00Z'),
        createdAt: new Date('2026-06-12T13:00:00Z')
      });

      // UNCONFIRMED Bookings (Must be EXCLUDED from revenue):
      // PENDING booking
      await Booking.create({
        userId: new mongoose.Types.ObjectId(),
        eventId: new mongoose.Types.ObjectId(eventId1),
        seats: 5,
        amount: 500,
        status: 'PENDING',
        idempotencyKey: 'seed-pending',
        expiresAt: new Date('2026-06-10T16:00:00Z'),
        createdAt: new Date('2026-06-10T15:00:00Z')
      });

      // EXPIRED booking
      await Booking.create({
        userId: new mongoose.Types.ObjectId(),
        eventId: new mongoose.Types.ObjectId(eventId1),
        seats: 2,
        amount: 200,
        status: 'EXPIRED',
        idempotencyKey: 'seed-expired',
        expiresAt: new Date('2026-06-10T10:00:00Z'),
        createdAt: new Date('2026-06-10T09:00:00Z')
      });

      // OUTSIDE date range booking (July 2026)
      await Booking.create({
        userId: new mongoose.Types.ObjectId(),
        eventId: new mongoose.Types.ObjectId(eventId1),
        seats: 2,
        amount: 200,
        status: 'CONFIRMED',
        idempotencyKey: 'seed-july',
        expiresAt: new Date('2026-07-05T12:00:00Z'),
        createdAt: new Date('2026-07-05T10:00:00Z')
      });

      // Query June 2026 report
      const res = await request(app)
        .get(`/admin/reports/revenue?from=${from}&to=${to}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { report, summary } = res.body.data;

      // Exactly 2 event-daily entries in June:
      expect(report.length).toBe(2);

      // Event 1 on 2026-06-10
      const e1Report = report.find((r: any) => r.eventId === eventId1);
      expect(e1Report).toBeDefined();
      expect(e1Report.eventTitle).toBe('Rock Concert 2026');
      expect(e1Report.date).toBe('2026-06-10');
      expect(e1Report.totalRevenue).toBe(300); // 200 + 100
      expect(e1Report.confirmedBookingsCount).toBe(2);
      expect(e1Report.totalSeatsSold).toBe(3);

      // Event 2 on 2026-06-12
      const e2Report = report.find((r: any) => r.eventId === eventId2);
      expect(e2Report).toBeDefined();
      expect(e2Report.eventTitle).toBe('Ballet Gala');
      expect(e2Report.date).toBe('2026-06-12');
      expect(e2Report.totalRevenue).toBe(150);
      expect(e2Report.confirmedBookingsCount).toBe(1);
      expect(e2Report.totalSeatsSold).toBe(3);

      // Grand Summary across all June confirmed bookings: 300 + 150 = 450
      expect(summary.totalRevenue).toBe(450);
      expect(summary.totalBookings).toBe(3);
      expect(summary.totalSeats).toBe(6);
    });

    it('should reject invalid from/to dates (from > to)', async () => {
      const invalidFrom = '2026-07-01T00:00:00.000Z';
      const invalidTo = '2026-06-01T00:00:00.000Z';

      const res = await request(app)
        .get(`/admin/reports/revenue?from=${invalidFrom}&to=${invalidTo}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
