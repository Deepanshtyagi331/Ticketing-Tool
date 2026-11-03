import { describe, test, assert, assertEqual, assertStatus } from './helpers/assertions.js';
import { api } from './helpers/api-client.js';
import { createTestUser, createAdminUser, calculateWebhookHmac } from './helpers/auth-helper.js';
import { generateRunId } from './config/test-config.js';

describe('Payment Webhook & HMAC Signature Verification Test Suite', async () => {
  const runId = generateRunId();
  let adminToken = '';
  let userToken = '';
  let eventId = '';
  let pendingBookingId = '';

  const admin = await createAdminUser();
  adminToken = admin.accessToken;

  const user = await createTestUser();
  userToken = user.accessToken;

  // Create an event
  const evRes = await api.post<{ data: { event: { _id?: string; id?: string } } }>('/events', {
    title: `Payment Test Event ${runId}`,
    date: new Date(Date.now() + 86400000).toISOString(),
    price: 60.00,
    totalSeats: 25
  }, { token: adminToken });
  eventId = (evRes.data.data.event._id || evRes.data.data.event.id || '').toString();

  // Create a pending booking
  const bkgRes = await api.post<{ data: { booking: { _id?: string; id?: string; status: string } } }>('/bookings', {
    eventId,
    seats: 2
  }, {
    token: userToken,
    headers: { 'Idempotency-Key': `pay-idem-${runId}` }
  });
  pendingBookingId = (bkgRes.data.data.booking._id || bkgRes.data.data.booking.id || '').toString();

  await test('POST /payments/webhook - Valid HMAC-SHA256 signature confirms PENDING booking', async () => {
    const rawPayload = JSON.stringify({
      event: 'payment.succeeded',
      bookingId: pendingBookingId,
      paymentId: `pay_valid_${runId}`,
      amount: 120.00
    });
    const validSignature = calculateWebhookHmac(rawPayload);

    const res = await api.post<{
      success: boolean;
      data: { status: string; bookingId: string };
    }>('/payments/webhook', rawPayload, {
      headers: { 'x-signature': validSignature }
    });

    assertStatus(res.status, 200, 'Valid webhook confirmation');
    assert(res.data.success);
    assertEqual(res.data.data.status, 'confirmed', 'Webhook confirms booking');
    assertEqual(res.data.data.bookingId, pendingBookingId);
  });

  await test('POST /payments/webhook - Rejects webhook with invalid HMAC signature (401 Unauthorized)', async () => {
    const rawPayload = JSON.stringify({
      event: 'payment.succeeded',
      bookingId: pendingBookingId,
      paymentId: `pay_invalid_sig_${runId}`,
      amount: 120.00
    });
    const invalidSignature = 'a'.repeat(64); // 64 hex characters of junk

    const res = await api.post<{ success: boolean; error: { code: string } }>('/payments/webhook', rawPayload, {
      headers: { 'x-signature': invalidSignature }
    });

    assertStatus(res.status, 401, 'Invalid signature rejection');
    assertEqual(res.data.error.code, 'UNAUTHORIZED');
  });

  await test('POST /payments/webhook - Rejects webhook with missing signature header', async () => {
    const rawPayload = JSON.stringify({
      event: 'payment.succeeded',
      bookingId: pendingBookingId,
      paymentId: `pay_missing_sig_${runId}`,
      amount: 120.00
    });

    const res = await api.post<{ success: boolean; error: { code: string } }>('/payments/webhook', rawPayload);

    assertStatus(res.status, 401, 'Missing signature header');
    assertEqual(res.data.error.code, 'UNAUTHORIZED');
  });

  await test('POST /payments/webhook - Rejects tampered body with old signature (raw body integrity check)', async () => {
    const originalPayload = JSON.stringify({
      event: 'payment.succeeded',
      bookingId: pendingBookingId,
      paymentId: `pay_tamper_${runId}`,
      amount: 120.00
    });
    const signature = calculateWebhookHmac(originalPayload);

    // Tamper the payload: change amount to $99999
    const tamperedPayload = JSON.stringify({
      event: 'payment.succeeded',
      bookingId: pendingBookingId,
      paymentId: `pay_tamper_${runId}`,
      amount: 99999.00
    });

    const res = await api.post<{ success: boolean; error: { code: string } }>('/payments/webhook', tamperedPayload, {
      headers: { 'x-signature': signature }
    });

    assertStatus(res.status, 401, 'Tampered payload rejection');
    assertEqual(res.data.error.code, 'UNAUTHORIZED');
  });

  await test('POST /payments/webhook - Handles duplicate webhook delivery idempotently without errors', async () => {
    // Re-send payment for the already-confirmed booking
    const rawPayload = JSON.stringify({
      event: 'payment.succeeded',
      bookingId: pendingBookingId,
      paymentId: `pay_duplicate_${runId}`,
      amount: 120.00
    });
    const signature = calculateWebhookHmac(rawPayload);

    const res = await api.post<{
      success: boolean;
      data: { status: string };
    }>('/payments/webhook', rawPayload, {
      headers: { 'x-signature': signature }
    });

    assertStatus(res.status, 200, 'Duplicate delivery');
    assertEqual(res.data.data.status, 'already_confirmed', 'Should acknowledge duplicate without errors');
  });
});
