import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app';
import { User, Event, Booking } from '../src/models';
import { computeHmac } from '../src/utils/hmac';
import { env } from '../src/config/env';
import { ExpiryWorker } from '../src/services/expiry.worker';

const TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/ticket_booking_payments_test';
const app = createApp();

let userId: string;
let eventId: string;

beforeAll(async () => {
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
  await Promise.all([User.syncIndexes(), Event.syncIndexes(), Booking.syncIndexes()]);

  const user = await User.create({
    name: 'Payment Tester',
    email: 'payment_tester@example.com',
    passwordHash: 'dummy_hash',
    role: 'user'
  });
  userId = user._id.toString();
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

beforeEach(async () => {
  await Booking.deleteMany({});
  await Event.deleteMany({});

  const event = await Event.create({
    title: 'Grand Opera Night',
    date: new Date(Date.now() + 10 * 86400000),
    price: 150,
    totalSeats: 100,
    availableSeats: 98 // 2 seats held
  });
  eventId = event._id.toString();
});

describe('Payment Webhook & Booking Expiry Suite', () => {
  describe('PART A: Payment Webhook', () => {
    let pendingBookingId: string;

    beforeEach(async () => {
      const booking = await Booking.create({
        userId: new mongoose.Types.ObjectId(userId),
        eventId: new mongoose.Types.ObjectId(eventId),
        seats: 2,
        amount: 300,
        status: 'PENDING',
        idempotencyKey: 'key-webhook-test-1',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes future
      });
      pendingBookingId = booking._id.toString();
    });

    it('should successfully confirm booking when valid HMAC signature is provided', async () => {
      const payload = {
        event: 'payment.succeeded',
        bookingId: pendingBookingId,
        paymentId: 'pay_stripe_mock_001',
        amount: 300
      };

      const rawJson = JSON.stringify(payload);
      const signature = computeHmac(rawJson, env.PAYMENT_WEBHOOK_SECRET);

      const res = await request(app)
        .post('/payments/webhook')
        .set('x-signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawJson);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('confirmed');

      // Verify database state: status is CONFIRMED
      const booking = await Booking.findById(pendingBookingId);
      expect(booking?.status).toBe('CONFIRMED');

      // Inventory remains 98 (seats held permanently)
      const event = await Event.findById(eventId);
      expect(event?.availableSeats).toBe(98);
    });

    it('should reject webhook with invalid HMAC signature with 401 Unauthorized', async () => {
      const payload = {
        event: 'payment.succeeded',
        bookingId: pendingBookingId,
        paymentId: 'pay_mock_bad_sig',
        amount: 300
      };

      const rawJson = JSON.stringify(payload);
      const invalidSignature = 'invalid_tampered_hmac_hex_digest_1234567890abcdef';

      const res = await request(app)
        .post('/payments/webhook')
        .set('x-signature', invalidSignature)
        .set('Content-Type', 'application/json')
        .send(rawJson);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/signature/i);

      // Verify booking was NOT confirmed
      const booking = await Booking.findById(pendingBookingId);
      expect(booking?.status).toBe('PENDING');
    });

    it('should handle duplicate webhooks idempotently without errors', async () => {
      const payload = {
        event: 'payment.succeeded',
        bookingId: pendingBookingId,
        paymentId: 'pay_duplicate_check',
        amount: 300
      };

      const rawJson = JSON.stringify(payload);
      const signature = computeHmac(rawJson, env.PAYMENT_WEBHOOK_SECRET);

      // First webhook call: confirms
      const res1 = await request(app)
        .post('/payments/webhook')
        .set('x-signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawJson);

      expect(res1.status).toBe(200);
      expect(res1.body.data.status).toBe('confirmed');

      // Second webhook call: duplicate delivery
      const res2 = await request(app)
        .post('/payments/webhook')
        .set('x-signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawJson);

      expect(res2.status).toBe(200);
      expect(res2.body.data.status).toBe('already_confirmed');
    });

    it('should reject late payment for an expired booking and designate refund required', async () => {
      // Manually set booking to EXPIRED (simulating expired reservation)
      await Booking.findByIdAndUpdate(pendingBookingId, {
        status: 'EXPIRED',
        expiresAt: new Date(Date.now() - 5000)
      });
      // Seats were returned to event
      await Event.findByIdAndUpdate(eventId, { availableSeats: 100 });

      const payload = {
        event: 'payment.succeeded',
        bookingId: pendingBookingId,
        paymentId: 'pay_late_arrival_999',
        amount: 300
      };

      const rawJson = JSON.stringify(payload);
      const signature = computeHmac(rawJson, env.PAYMENT_WEBHOOK_SECRET);

      const res = await request(app)
        .post('/payments/webhook')
        .set('x-signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawJson);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('late_payment_refund_required');
      expect(res.body.data.message).toMatch(/refund or manual reconciliation/i);

      // Verify booking was NOT modified to CONFIRMED
      const booking = await Booking.findById(pendingBookingId);
      expect(booking?.status).toBe('EXPIRED');

      // Verify event inventory was not touched
      const event = await Event.findById(eventId);
      expect(event?.availableSeats).toBe(100);
    });
  });

  describe('PART B: Expiry Worker & Concurrency Control', () => {
    it('should find expired PENDING bookings, flip status to EXPIRED, and release seats', async () => {
      // Create 2 expired bookings (2 seats and 3 seats)
      const b1 = await Booking.create({
        userId: new mongoose.Types.ObjectId(userId),
        eventId: new mongoose.Types.ObjectId(eventId),
        seats: 2,
        amount: 300,
        status: 'PENDING',
        idempotencyKey: 'exp-b1',
        expiresAt: new Date(Date.now() - 10000)
      });

      const b2 = await Booking.create({
        userId: new mongoose.Types.ObjectId(userId),
        eventId: new mongoose.Types.ObjectId(eventId),
        seats: 3,
        amount: 450,
        status: 'PENDING',
        idempotencyKey: 'exp-b2',
        expiresAt: new Date(Date.now() - 5000)
      });

      // Initially event availableSeats is 98 - 3 = 95
      await Event.findByIdAndUpdate(eventId, { availableSeats: 95 });

      // Run expiry worker batch
      const result = await ExpiryWorker.processExpiredBookings(50);

      expect(result.processedCount).toBeGreaterThanOrEqual(2);
      expect(result.expiredBookingIds).toContain(b1._id.toString());
      expect(result.expiredBookingIds).toContain(b2._id.toString());
      expect(result.seatsReleased).toBe(5); // 2 + 3 = 5 seats released

      // Verify database status
      const updatedB1 = await Booking.findById(b1._id);
      const updatedB2 = await Booking.findById(b2._id);
      expect(updatedB1?.status).toBe('EXPIRED');
      expect(updatedB2?.status).toBe('EXPIRED');

      // Verify availableSeats increased back to 100
      const event = await Event.findById(eventId);
      expect(event?.availableSeats).toBe(100);
    });

    it('should guarantee no double seat release when two workers process the same expired booking simultaneously', async () => {
      const expiredBooking = await Booking.create({
        userId: new mongoose.Types.ObjectId(userId),
        eventId: new mongoose.Types.ObjectId(eventId),
        seats: 4,
        amount: 600,
        status: 'PENDING',
        idempotencyKey: 'exp-concurrent-test',
        expiresAt: new Date(Date.now() - 20000)
      });

      // Starting with availableSeats: 94 (100 - 2 - 4)
      await Event.findByIdAndUpdate(eventId, { availableSeats: 94 });

      // Simulate 2 competing worker threads running concurrently
      const [worker1Result, worker2Result] = await Promise.all([
        ExpiryWorker.expireSingleBooking(expiredBooking._id.toString()),
        ExpiryWorker.expireSingleBooking(expiredBooking._id.toString())
      ]);

      // Exactly ONE worker must succeed, and the other must return success: false
      const successes = [worker1Result.success, worker2Result.success].sort();
      expect(successes).toEqual([false, true]);

      // Total seats released across both workers must be exactly 4 (not 8!)
      const totalReleased = worker1Result.seatsReleased + worker2Result.seatsReleased;
      expect(totalReleased).toBe(4);

      // Verify event availableSeats increased by exactly 4 (94 + 4 = 98)
      const event = await Event.findById(eventId);
      expect(event?.availableSeats).toBe(98);
    });

    it('should safely resolve race between payment webhook confirmation and expiry worker', async () => {
      // Create a booking right on the verge of expiration
      const raceBooking = await Booking.create({
        userId: new mongoose.Types.ObjectId(userId),
        eventId: new mongoose.Types.ObjectId(eventId),
        seats: 2,
        amount: 300,
        status: 'PENDING',
        idempotencyKey: 'key-race-payment-expiry',
        expiresAt: new Date(Date.now() - 100) // Just expired
      });

      const payload = {
        event: 'payment.succeeded',
        bookingId: raceBooking._id.toString(),
        paymentId: 'pay_race_condition_test',
        amount: 300
      };

      const rawJson = JSON.stringify(payload);
      const signature = computeHmac(rawJson, env.PAYMENT_WEBHOOK_SECRET);

      // Competing: Payment webhook confirmation vs. Expiry worker
      const [webhookRes, workerRes] = await Promise.all([
        request(app)
          .post('/payments/webhook')
          .set('x-signature', signature)
          .set('Content-Type', 'application/json')
          .send(rawJson),
        ExpiryWorker.expireSingleBooking(raceBooking._id.toString())
      ]);

      expect(webhookRes.status).toBe(200);

      // Verify that the final booking state is unambiguous and mutually consistent:
      const finalBooking = await Booking.findById(raceBooking._id);
      expect(['CONFIRMED', 'EXPIRED']).toContain(finalBooking?.status);

      if (finalBooking?.status === 'EXPIRED') {
        // If expired, webhook must have detected late payment
        expect(webhookRes.body.data.status).toBe('late_payment_refund_required');
      } else {
        // If confirmed, worker must not have released seats
        expect(workerRes.success).toBe(false);
        expect(webhookRes.body.data.status).toBe('confirmed');
      }
    });
  });
});

