import { describe, test, assert, assertEqual, assertStatus } from './helpers/assertions.js';
import { api } from './helpers/api-client.js';
import { createTestUser, createAdminUser } from './helpers/auth-helper.js';
import { generateRunId } from './config/test-config.js';

describe('Booking Engine & Idempotency Test Suite', async () => {
  const runId = generateRunId();
  let adminToken = '';
  let user1Token = '';
  let user2Token = '';
  let eventId = '';
  let createdBookingId = '';

  const admin = await createAdminUser();
  adminToken = admin.accessToken;

  const user1 = await createTestUser({ namePrefix: 'Booker One' });
  user1Token = user1.accessToken;

  const user2 = await createTestUser({ namePrefix: 'Booker Two' });
  user2Token = user2.accessToken;

  // Setup test event with 20 seats
  const createEvRes = await api.post<{
    success: boolean;
    data: { event: { _id?: string; id?: string; availableSeats: number } };
  }>('/events', {
    title: `Booking Test Event ${runId}`,
    date: new Date(Date.now() + 5 * 86400000).toISOString(),
    price: 45.00,
    totalSeats: 20
  }, { token: adminToken });
  eventId = (createEvRes.data.data.event._id || createEvRes.data.data.event.id || '').toString();

  const primaryIdemKey = `idem-${runId}-001`;

  await test('POST /bookings - User can hold 2 seats in PENDING status for 10 minutes', async () => {
    const res = await api.post<{
      success: boolean;
      data: {
        booking: {
          _id?: string;
          id?: string;
          status: string;
          seats: number;
          amount: number;
          expiresAt: string;
        };
      };
    }>('/bookings', {
      eventId,
      seats: 2
    }, {
      token: user1Token,
      headers: { 'Idempotency-Key': primaryIdemKey }
    });

    assertStatus(res.status, 201, 'Booking creation');
    assert(res.data.success, 'Success is true');
    assertEqual(res.data.data.booking.status, 'PENDING', 'Initial status is PENDING');
    assertEqual(res.data.data.booking.seats, 2, 'Seats booked');
    assertEqual(res.data.data.booking.amount, 90.00, 'Price calculated correctly ($45 * 2 = $90)');

    createdBookingId = (res.data.data.booking._id || res.data.data.booking.id || '').toString();
    assert(!!createdBookingId, 'Booking ID is returned');

    // Verify 10-minute hold window
    const expiresAt = new Date(res.data.data.booking.expiresAt).getTime();
    const holdDurationMinutes = Math.round((expiresAt - Date.now()) / 60000);
    assert(holdDurationMinutes >= 9 && holdDurationMinutes <= 11, `Hold duration should be ~10m (got ${holdDurationMinutes}m)`);

    // Verify availableSeats in event decremented from 20 to 18
    const evRes = await api.get<{ data: { event: { availableSeats: number } } }>(`/events/${eventId}`);
    assertEqual(evRes.data.data.event.availableSeats, 18, 'Available seats decremented by 2');
  });

  await test('POST /bookings - Idempotent replay: Resending same key returns original booking without double-holding seats', async () => {
    // 1. Check seats before replay
    const beforeRes = await api.get<{ data: { event: { availableSeats: number } } }>(`/events/${eventId}`);
    const seatsBefore = beforeRes.data.data.event.availableSeats;

    // 2. Replay with identical key
    const replayRes = await api.post<{
      success: boolean;
      data: {
        booking: { _id?: string; id?: string };
        idempotentReplay?: boolean;
      };
    }>('/bookings', {
      eventId,
      seats: 2
    }, {
      token: user1Token,
      headers: { 'Idempotency-Key': primaryIdemKey }
    });

    assertStatus(replayRes.status, [200, 201], 'Idempotent replay returns 200 or 201');
    const returnedId = (replayRes.data.data.booking._id || replayRes.data.data.booking.id || '').toString();
    assertEqual(returnedId, createdBookingId, 'Must return original booking ID');

    // 3. Check seats after replay
    const afterRes = await api.get<{ data: { event: { availableSeats: number } } }>(`/events/${eventId}`);
    assertEqual(afterRes.data.data.event.availableSeats, seatsBefore, 'Inventory must not be decremented a second time');
  });

  await test('POST /bookings - Rejects request without Idempotency-Key header', async () => {
    const res = await api.post<{ success: boolean; error: { code: string } }>('/bookings', {
      eventId,
      seats: 1
    }, {
      token: user1Token
      // omitting Idempotency-Key header
    });

    assertStatus(res.status, 400, 'Missing idempotency key');
    assertEqual(res.data.error.code, 'VALIDATION_ERROR');
  });

  await test('POST /bookings - Rejects invalid event ID format', async () => {
    const res = await api.post<{ success: boolean; error: { code: string } }>('/bookings', {
      eventId: 'invalid_format_id',
      seats: 1
    }, {
      token: user1Token,
      headers: { 'Idempotency-Key': `invalid-id-${runId}` }
    });

    assertStatus(res.status, 400, 'Invalid eventId format');
    assertEqual(res.data.error.code, 'VALIDATION_ERROR');
  });

  await test('POST /bookings - Rejects non-existent event with HTTP 404', async () => {
    const res = await api.post<{ success: boolean; error: { code: string } }>('/bookings', {
      eventId: '507f1f77bcf86cd799439011',
      seats: 1
    }, {
      token: user1Token,
      headers: { 'Idempotency-Key': `nonexistent-id-${runId}` }
    });

    assertStatus(res.status, 404, 'Non-existent event');
    assertEqual(res.data.error.code, 'NOT_FOUND');
  });

  await test('POST /bookings - Rejects invalid seat count (0 or negative)', async () => {
    const freshUser = await createTestUser({ namePrefix: 'Zero Seats' });
    const res = await api.post<{ success: boolean; error: { code: string } }>('/bookings', {
      eventId,
      seats: 0
    }, {
      token: freshUser.accessToken,
      headers: { 'Idempotency-Key': `zero-seats-${runId}` }
    });

    assertStatus(res.status, 400, 'Zero seats requested');
    assertEqual(res.data.error.code, 'VALIDATION_ERROR');
  });

  await test('POST /bookings - Returns HTTP 409 when requested seats exceed available inventory', async () => {
    // Create an event with only 1 seat
    const singleSeatEv = await api.post<{ data: { event: { _id?: string; id?: string } } }>('/events', {
      title: `Single Seat Event ${runId}`,
      date: new Date().toISOString(),
      price: 20,
      totalSeats: 1
    }, { token: adminToken });
    const singleSeatId = (singleSeatEv.data.data.event._id || singleSeatEv.data.data.event.id || '').toString();

    // Request 2 seats on a 1-seat event
    const overbookRes = await api.post<{ success: boolean; error: { code: string } }>('/bookings', {
      eventId: singleSeatId,
      seats: 2
    }, {
      token: user2Token,
      headers: { 'Idempotency-Key': `overbook-${runId}` }
    });

    assertStatus(overbookRes.status, 409, 'Overbooking rejection');
    assert(
      overbookRes.data.error.code === 'CONFLICT' || overbookRes.data.error.code === 'INSUFFICIENT_SEATS',
      'Error code must indicate conflict / insufficient inventory'
    );
  });

  await test('POST /bookings - Rate limit: 6th request within 1 minute returns HTTP 429', async () => {
    const rateLimitUser = await createTestUser({ namePrefix: 'RL Test' });
    const statuses: number[] = [];

    // Rapidly send 6 requests
    for (let i = 1; i <= 6; i++) {
      const res = await api.post('/bookings', {
        eventId,
        seats: 1
      }, {
        token: rateLimitUser.accessToken,
        headers: { 'Idempotency-Key': `rl-test-key-${runId}-${i}` }
      });
      statuses.push(res.status);
    }

    assert(statuses.slice(0, 5).every((s) => s === 201 || s === 409), 'First 5 requests within rate limit');
    assertEqual(statuses[5], 429, '6th request must be rate limited with HTTP 429');
  });
});
