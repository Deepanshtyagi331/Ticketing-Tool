import { describe, test, assert, assertEqual, assertStatus } from './helpers/assertions.js';
import { api } from './helpers/api-client.js';
import { createTestUser, createAdminUser, calculateWebhookHmac } from './helpers/auth-helper.js';
import { generateRunId } from './config/test-config.js';

describe('Admin Revenue Report & Aggregation Test Suite', async () => {
  const runId = generateRunId();
  let adminToken = '';
  let userToken = '';
  let eventId = '';
  let confirmedBookingId = '';

  const admin = await createAdminUser();
  adminToken = admin.accessToken;

  const user = await createTestUser();
  userToken = user.accessToken;

  // 1. Create an event
  const evRes = await api.post<{ data: { event: { _id?: string; id?: string } } }>('/events', {
    title: `Report Event ${runId}`,
    date: new Date(Date.now() + 86400000).toISOString(),
    price: 75.00,
    totalSeats: 20
  }, { token: adminToken });
  eventId = (evRes.data.data.event._id || evRes.data.data.event.id || '').toString();

  // 2. Create a booking for 2 seats ($150)
  const bkgRes = await api.post<{ data: { booking: { _id?: string; id?: string } } }>('/bookings', {
    eventId,
    seats: 2
  }, {
    token: userToken,
    headers: { 'Idempotency-Key': `report-idem-${runId}` }
  });
  confirmedBookingId = (bkgRes.data.data.booking._id || bkgRes.data.data.booking.id || '').toString();

  // 3. Confirm this booking via mock payment webhook
  const rawPayload = JSON.stringify({
    event: 'payment.succeeded',
    bookingId: confirmedBookingId,
    paymentId: `pay_report_${runId}`,
    amount: 150.00
  });
  const sig = calculateWebhookHmac(rawPayload);
  await api.post('/payments/webhook', rawPayload, { headers: { 'x-signature': sig } });

  await test('GET /admin/reports/revenue - Admin can retrieve aggregated revenue report with date bounds', async () => {
    const from = new Date(Date.now() - 86400000).toISOString();
    const to = new Date(Date.now() + 30 * 86400000).toISOString();

    const res = await api.get<{
      success: boolean;
      data: {
        report: Array<{
          eventId: string;
          eventTitle: string;
          totalRevenue: number;
          confirmedBookingsCount: number;
          totalSeatsSold: number;
        }>;
        summary: {
          totalRevenue: number;
          totalBookings: number;
          totalSeats: number;
          from: string;
          to: string;
        };
      };
    }>(`/admin/reports/revenue?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
      token: adminToken
    });

    assertStatus(res.status, 200, 'Admin revenue report');
    assert(res.data.success);
    assert(typeof res.data.data.summary.totalRevenue === 'number', 'Summary totalRevenue must be numeric');
    assert(typeof res.data.data.summary.totalSeats === 'number', 'Summary totalSeats must be numeric');
    assert(typeof res.data.data.summary.totalBookings === 'number', 'Summary totalBookings must be numeric');

    // Verify mathematical consistency: summary totals match sum of individual daily event items
    const calculatedRevenue = res.data.data.report.reduce((acc, ev) => acc + ev.totalRevenue, 0);
    const calculatedSeats = res.data.data.report.reduce((acc, ev) => acc + ev.totalSeatsSold, 0);

    assertEqual(
      Math.round(calculatedRevenue * 100) / 100,
      Math.round(res.data.data.summary.totalRevenue * 100) / 100,
      'Summary revenue must match sum of individual report revenues'
    );
    assertEqual(
      calculatedSeats,
      res.data.data.summary.totalSeats,
      'Summary seats must match sum of report seats sold'
    );
  });

  await test('GET /admin/reports/revenue - Regular user cannot access report (403 Forbidden)', async () => {
    const from = new Date(Date.now() - 86400000).toISOString();
    const to = new Date().toISOString();
    const res = await api.get<{ success: boolean; error: { code: string } }>(
      `/admin/reports/revenue?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { token: userToken }
    );

    assertStatus(res.status, 403, 'Regular user blocked from report');
    assertEqual(res.data.error.code, 'FORBIDDEN');
  });

  await test('GET /admin/reports/revenue - Missing date parameters rejected with HTTP 400', async () => {
    const res = await api.get<{ success: boolean; error: { code: string } }>('/admin/reports/revenue', {
      token: adminToken
    });

    assertStatus(res.status, 400, 'Missing from/to date parameters');
    assertEqual(res.data.error.code, 'VALIDATION_ERROR');
  });

  await test('GET /admin/reports/revenue - Rejects invalid date format with HTTP 400', async () => {
    const res = await api.get<{ success: boolean; error: { code: string } }>(
      '/admin/reports/revenue?from=not-a-date&to=invalid',
      { token: adminToken }
    );

    assertStatus(res.status, 400, 'Invalid date query');
    assertEqual(res.data.error.code, 'VALIDATION_ERROR');
  });
});
