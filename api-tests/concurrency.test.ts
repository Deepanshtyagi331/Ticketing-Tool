import { describe, test, assert, assertEqual } from './helpers/assertions.js';
import { api } from './helpers/api-client.js';
import { createTestUser, createAdminUser } from './helpers/auth-helper.js';
import { generateRunId } from './config/test-config.js';

describe('Concurrency & Anti-Overselling Stress Test Suite', async () => {
  const runId = generateRunId();

  await test('MANDATORY: 50 concurrent requests competing for 10 seats (Atomic conditional inventory control)', async () => {
    console.log('\n  ⚙️ [Step 1] Creating an isolated event with EXACTLY 10 seats...');
    const admin = await createAdminUser();
    const createEvRes = await api.post<{
      success: boolean;
      data: { event: { _id?: string; id?: string; availableSeats: number; totalSeats: number } };
    }>('/events', {
      title: `Concurrency Stress Test Event ${runId}`,
      date: new Date(Date.now() + 14 * 86400000).toISOString(),
      price: 50.00,
      totalSeats: 10
    }, { token: admin.accessToken });

    const eventId = (createEvRes.data.data.event._id || createEvRes.data.data.event.id || '').toString();
    assertEqual(createEvRes.data.data.event.totalSeats, 10, 'Initial total seats');
    assertEqual(createEvRes.data.data.event.availableSeats, 10, 'Initial available seats');

    console.log(`  ⚙️ [Step 2] Registering 50 unique test users to simulate independent concurrent buyers...`);
    const userTokens: string[] = [];
    const registerPromises = Array.from({ length: 50 }).map(async (_, idx) => {
      const user = await createTestUser({ namePrefix: `Stress Buyer ${idx}` });
      return user.accessToken;
    });

    const tokens = await Promise.all(registerPromises);
    for (const t of tokens) {
      if (t) userTokens.push(t);
    }
    assertEqual(userTokens.length, 50, 'All 50 users provisioned');

    console.log(`  🚀 [Step 3] Dispatching 50 simultaneous parallel requests competing for 10 seats...`);
    const bookingPromises = userTokens.map(async (token, idx) => {
      const idempotencyKey = `concurrency-stress-${runId}-${idx}`;
      const res = await api.post<{
        success: boolean;
        data?: { booking: { id: string } };
        error?: { code: string; message: string };
      }>('/bookings', {
        eventId,
        seats: 1
      }, {
        token,
        headers: { 'Idempotency-Key': idempotencyKey }
      });
      return { status: res.status, data: res.data };
    });

    // Execute concurrently using Promise.all
    const startTime = Date.now();
    const responses = await Promise.all(bookingPromises);
    const durationMs = Date.now() - startTime;

    console.log(`  ⏱️ [Step 4] All 50 requests completed in ${durationMs}ms. Analyzing outcomes...`);

    const successful = responses.filter((r) => r.status === 201);
    const conflicts = responses.filter((r) => r.status === 409);
    const unexpectedErrors = responses.filter((r) => r.status !== 201 && r.status !== 409);

    console.log(`     - HTTP 201 Created:   ${successful.length} (Expected: 10)`);
    console.log(`     - HTTP 409 Conflict:  ${conflicts.length} (Expected: 40)`);
    console.log(`     - Unexpected Errors:  ${unexpectedErrors.length} (Expected: 0)`);

    // Fetch final event state from server
    const finalEventRes = await api.get<{
      data: { event: { availableSeats: number; totalSeats: number } };
    }>(`/events/${eventId}`);
    const finalAvailableSeats = finalEventRes.data.data.event.availableSeats;
    console.log(`     - Final Available Seats: ${finalAvailableSeats} (Expected: 0)`);

    // Strict assertions
    assertEqual(successful.length, 10, 'Exactly 10 requests must succeed with HTTP 201');
    assertEqual(conflicts.length, 40, 'Exactly 40 requests must receive HTTP 409 Conflict');
    assertEqual(unexpectedErrors.length, 0, 'Zero unexpected errors (5xx/400) allowed');
    assertEqual(finalAvailableSeats, 0, 'Final inventory must reach exactly 0 seats');
    assert(finalAvailableSeats >= 0, 'Inventory must NEVER become negative (anti-overselling guarantee)');
  });
});

