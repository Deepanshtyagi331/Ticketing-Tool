import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app';
import { User, Event, Booking } from '../src/models';

const TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/ticket_booking_bookings_test';
const app = createApp();

let userToken: string;
let otherUserToken: string;
let eventId: string;

let userCount = 0;

beforeAll(async () => {
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
  await Promise.all([User.syncIndexes(), Event.syncIndexes(), Booking.syncIndexes()]);
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

beforeEach(async () => {
  await Booking.deleteMany({});
  await Event.deleteMany({});

  userCount++;
  const user1 = await request(app).post('/auth/register').send({
    name: `Booking User ${userCount}`,
    email: `booking_user_${userCount}@example.com`,
    password: 'Password123!',
    role: 'user'
  });
  userToken = user1.body.data.accessToken;

  const user2 = await request(app).post('/auth/register').send({
    name: `Second Booking User ${userCount}`,
    email: `booking_user2_${userCount}@example.com`,
    password: 'Password123!',
    role: 'user'
  });
  otherUserToken = user2.body.data.accessToken;

  // Seed standard test event: 50 seats at $100 each
  const event = await Event.create({
    title: 'Stadium Rock Tour',
    description: 'High demand stadium concert',
    date: new Date(Date.now() + 14 * 86400000),
    price: 100,
    totalSeats: 50,
    availableSeats: 50
  });
  eventId = event._id.toString();
});

describe('Booking Engine & Concurrency Control Suite', () => {
  describe('POST /bookings (Single & Multiple Seat Reservations)', () => {
    it('should create a PENDING booking for 1 seat held for 10 minutes', async () => {
      const idempotencyKey = 'key-single-seat-001';
      const beforeTime = Date.now();

      const res = await request(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ eventId, seats: 1 });

      const afterTime = Date.now();

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isRetry).toBe(false);

      const booking = res.body.data.booking;
      expect(booking.seats).toBe(1);
      expect(booking.amount).toBe(100);
      expect(booking.status).toBe('PENDING');
      expect(booking.idempotencyKey).toBe(idempotencyKey);

      // Verify expiration is ~10 minutes in the future
      const expiresAt = new Date(booking.expiresAt).getTime();
      const expectedMin = beforeTime + 10 * 60 * 1000 - 1000;
      const expectedMax = afterTime + 10 * 60 * 1000 + 1000;
      expect(expiresAt).toBeGreaterThanOrEqual(expectedMin);
      expect(expiresAt).toBeLessThanOrEqual(expectedMax);

      // Verify event inventory was decremented by 1
      const updatedEvent = await Event.findById(eventId);
      expect(updatedEvent?.availableSeats).toBe(49);
    });

    it('should reserve multiple seats and calculate amount snapshot correctly', async () => {
      const res = await request(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .set('Idempotency-Key', 'key-multi-seats-002')
        .send({ eventId, seats: 4 });

      expect(res.status).toBe(201);
      expect(res.body.data.booking.seats).toBe(4);
      expect(res.body.data.booking.amount).toBe(400); // 4 seats * $100

      const updatedEvent = await Event.findById(eventId);
      expect(updatedEvent?.availableSeats).toBe(46);
    });

    it('should reject request when Idempotency-Key header is missing', async () => {
      const res = await request(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ eventId, seats: 2 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject unauthenticated request with 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/bookings')
        .set('Idempotency-Key', 'key-no-auth')
        .send({ eventId, seats: 1 });

      expect(res.status).toBe(401);
    });
  });

  describe('Inventory Shortage & Sold-Out Handling', () => {
    it('should return 409 Conflict when requested seats exceed availableSeats', async () => {
      const res = await request(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .set('Idempotency-Key', 'key-exceed-seats')
        .send({ eventId, seats: 51 }); // Only 50 available

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(res.body.error.message).toMatch(/insufficient seats/i);

      // Verify inventory was not changed
      const event = await Event.findById(eventId);
      expect(event?.availableSeats).toBe(50);
    });

    it('should return 409 Conflict when event is completely sold out', async () => {
      // Set availableSeats to 0
      await Event.findByIdAndUpdate(eventId, { availableSeats: 0 });

      const res = await request(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .set('Idempotency-Key', 'key-sold-out')
        .send({ eventId, seats: 1 });

      expect(res.status).toBe(409);
      expect(res.body.error.message).toMatch(/insufficient seats/i);

      const event = await Event.findById(eventId);
      expect(event?.availableSeats).toBe(0);
    });
  });

  describe('Idempotency Guarantees & Payload Matching', () => {
    it('should return the original booking on retry with same key without deducting inventory twice', async () => {
      const idempotencyKey = 'key-retry-test-123';

      // First request (fresh booking)
      const firstRes = await request(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ eventId, seats: 2 });

      expect(firstRes.status).toBe(201);
      expect(firstRes.body.data.isRetry).toBe(false);
      const originalId = firstRes.body.data.booking.id;

      // Check inventory after first call
      const eventAfterFirst = await Event.findById(eventId);
      expect(eventAfterFirst?.availableSeats).toBe(48);

      // Second request (identical retry)
      const retryRes = await request(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ eventId, seats: 2 });

      expect(retryRes.status).toBe(200);
      expect(retryRes.body.data.isRetry).toBe(true);
      expect(retryRes.body.data.booking.id).toBe(originalId);

      // Verify inventory was NOT decremented a second time
      const eventAfterSecond = await Event.findById(eventId);
      expect(eventAfterSecond?.availableSeats).toBe(48);
    });

    it('should return 409 Conflict when same key is used with a different seat count', async () => {
      const idempotencyKey = 'key-payload-conflict';

      // Initial booking with 2 seats
      await request(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ eventId, seats: 2 });

      // Reuse same key but requesting 5 seats
      const conflictRes = await request(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ eventId, seats: 5 });

      expect(conflictRes.status).toBe(409);
      expect(conflictRes.body.success).toBe(false);
      expect(conflictRes.body.error.message).toMatch(/different booking payload/i);
    });
  });

  describe('Concurrency & Race-Condition Control', () => {
    it('should handle concurrent duplicate requests with same key safely (only 1 booking created)', async () => {
      const idempotencyKey = 'key-concurrent-duplicate-999';

      // Fire 5 identical concurrent requests
      const promises = Array.from({ length: 5 }, () =>
        request(app)
          .post('/bookings')
          .set('Authorization', `Bearer ${userToken}`)
          .set('Idempotency-Key', idempotencyKey)
          .send({ eventId, seats: 2 })
      );

      const responses = await Promise.all(promises);

      // Every response should succeed (either 201 Created or 200 OK retry)
      for (const res of responses) {
        expect([200, 201]).toContain(res.status);
        expect(res.body.success).toBe(true);
      }

      // Exactly ONE booking document must exist in database
      const bookingsInDb = await Booking.find({ idempotencyKey });
      expect(bookingsInDb.length).toBe(1);

      // Exactly 2 seats must be deducted from 50 (leaving 48)
      const event = await Event.findById(eventId);
      expect(event?.availableSeats).toBe(48);
    });

    it('should rollback and restore inventory if booking creation fails during transaction', async () => {
      // Spy on Booking.create to simulate unexpected database crash during insert
      const createSpy = jest.spyOn(Booking, 'create').mockRejectedValueOnce(new Error('Simulated Database Crash'));

      const res = await request(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .set('Idempotency-Key', 'key-fail-rollback')
        .send({ eventId, seats: 5 });

      expect(res.status).toBe(500);

      // Verify that the 5 seats were rolled back and not permanently lost
      const event = await Event.findById(eventId);
      expect(event?.availableSeats).toBe(50);

      createSpy.mockRestore();
    });

    it('should prevent overselling when concurrent requests compete for the last available seats', async () => {
      // Set availableSeats to exactly 5
      await Event.findByIdAndUpdate(eventId, { totalSeats: 5, availableSeats: 5 });

      // User 1 asks for 3 seats, User 2 asks for 4 seats concurrently
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/bookings')
          .set('Authorization', `Bearer ${userToken}`)
          .set('Idempotency-Key', 'concurrent-user1-seats3')
          .send({ eventId, seats: 3 }),
        request(app)
          .post('/bookings')
          .set('Authorization', `Bearer ${otherUserToken}`)
          .set('Idempotency-Key', 'concurrent-user2-seats4')
          .send({ eventId, seats: 4 })
      ]);

      const statuses = [res1.status, res2.status].sort();
      // One request must succeed (201) and the other must fail with 409 Conflict
      expect(statuses).toEqual([201, 409]);

      // availableSeats must be non-negative:
      // If user 1 won (3 seats), remaining is 2.
      // If user 2 won (4 seats), remaining is 1.
      const event = await Event.findById(eventId);
      expect([1, 2]).toContain(event?.availableSeats);
      expect(event?.availableSeats).toBeGreaterThanOrEqual(0);
    });
  });
});
