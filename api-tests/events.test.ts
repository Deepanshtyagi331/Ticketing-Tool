import { describe, test, assert, assertEqual, assertStatus } from './helpers/assertions.js';
import { api } from './helpers/api-client.js';
import { createTestUser, createAdminUser } from './helpers/auth-helper.js';
import { generateRunId } from './config/test-config.js';

describe('Event Management API Test Suite', async () => {
  const runId = generateRunId();
  let adminToken = '';
  let userToken = '';
  let createdEventId = '';

  const initialEventPayload = {
    title: `SaaS Architecture Summit ${runId}`,
    description: 'Flagship engineering event on scalable architecture',
    date: new Date(Date.now() + 10 * 86400000).toISOString(),
    price: 99.00,
    totalSeats: 200
  };

  // Setup admin and user
  const admin = await createAdminUser();
  adminToken = admin.accessToken;

  const regularUser = await createTestUser();
  userToken = regularUser.accessToken;

  await test('POST /events - Admin can create an event (availableSeats equals totalSeats)', async () => {
    const res = await api.post<{
      success: boolean;
      data: { event: { _id?: string; id?: string; title: string; availableSeats: number; totalSeats: number } };
    }>('/events', initialEventPayload, { token: adminToken });

    assertStatus(res.status, 201, 'Event creation by admin');
    assert(res.data.success, 'Success is true');
    assertEqual(res.data.data.event.title, initialEventPayload.title);
    assertEqual(res.data.data.event.totalSeats, initialEventPayload.totalSeats);
    assertEqual(res.data.data.event.availableSeats, initialEventPayload.totalSeats, 'availableSeats initially equals totalSeats');

    createdEventId = (res.data.data.event._id || res.data.data.event.id || '').toString();
    assert(!!createdEventId, 'Event ID must be present');
  });

  await test('POST /events - Regular user cannot create an event (403 Forbidden)', async () => {
    const res = await api.post<{ success: boolean; error: { code: string } }>('/events', {
      title: 'Hacked Event',
      date: new Date().toISOString(),
      price: 10,
      totalSeats: 10
    }, { token: userToken });

    assertStatus(res.status, 403, 'Regular user event creation');
    assertEqual(res.data.error.code, 'FORBIDDEN');
  });

  await test('GET /events/:id - Retrieves single event details', async () => {
    const res = await api.get<{
      success: boolean;
      data: { event: { title: string; totalSeats: number } };
    }>(`/events/${createdEventId}`);

    assertStatus(res.status, 200, 'Single event fetch');
    assert(res.data.success);
    assertEqual(res.data.data.event.title, initialEventPayload.title);
  });

  await test('GET /events/:id - Rejects invalid ObjectId format with HTTP 400', async () => {
    const res = await api.get<{ success: boolean; error: { code: string } }>('/events/not-a-valid-hex-id-123');
    assertStatus(res.status, 400, 'Invalid ObjectId');
    assertEqual(res.data.error.code, 'VALIDATION_ERROR');
  });

  await test('GET /events/:id - Returns HTTP 404 for non-existent event', async () => {
    const res = await api.get<{ success: boolean; error: { code: string } }>('/events/507f1f77bcf86cd799439011');
    assertStatus(res.status, 404, 'Non-existent event');
    assertEqual(res.data.error.code, 'NOT_FOUND');
  });

  await test('PATCH /events/:id - Admin can update event title and capacity', async () => {
    const res = await api.patch<{
      success: boolean;
      data: { event: { title: string; totalSeats: number; availableSeats: number } };
    }>(`/events/${createdEventId}`, {
      title: `${initialEventPayload.title} (Updated)`,
      totalSeats: 250
    }, { token: adminToken });

    assertStatus(res.status, 200, 'Admin updates capacity');
    assert(res.data.success);
    assertEqual(res.data.data.event.totalSeats, 250);
    assertEqual(res.data.data.event.availableSeats, 250);
  });

  await test('PATCH /events/:id - Regular user cannot update event (403 Forbidden)', async () => {
    const res = await api.patch<{ success: boolean; error: { code: string } }>(`/events/${createdEventId}`, {
      title: 'Hacked Title'
    }, { token: userToken });

    assertStatus(res.status, 403, 'Regular user update');
    assertEqual(res.data.error.code, 'FORBIDDEN');
  });

  await test('GET /events - Cursor-based pagination without skip()', async () => {
    const page1Res = await api.get<{
      success: boolean;
      data: {
        events: Array<{ _id?: string; id?: string }>;
        pagination: { nextCursor: string | null; hasMore: boolean };
      };
    }>('/events?limit=2');

    assertStatus(page1Res.status, 200, 'Page 1 fetch');
    assert(Array.isArray(page1Res.data.data.events), 'Events must be an array');
    assert(page1Res.data.data.pagination !== undefined, 'Pagination metadata must be returned');

    // If there is more than 1 page, verify cursor stability and zero duplicates
    if (page1Res.data.data.pagination.nextCursor) {
      const cursor = encodeURIComponent(page1Res.data.data.pagination.nextCursor);
      const page2Res = await api.get<{
        success: boolean;
        data: { events: Array<{ _id?: string; id?: string }> };
      }>(`/events?cursor=${cursor}&limit=2`);

      assertStatus(page2Res.status, 200, 'Page 2 fetch');
      const page1Ids = new Set(page1Res.data.data.events.map((e) => (e._id || e.id || '').toString()));
      const duplicateFound = page2Res.data.data.events.some((e) => page1Ids.has((e._id || e.id || '').toString()));
      assert(!duplicateFound, 'Zero duplicate records allowed between page 1 and page 2');
    }
  });

  await test('GET /events - Date range filtering and text search', async () => {
    // 1. Text search on title
    const searchRes = await api.get<{
      success: boolean;
      data: { events: Array<{ title: string }> };
    }>(`/events?search=SaaS%20Architecture`);
    assertStatus(searchRes.status, 200, 'Title search');
    assert(searchRes.data.data.events.length > 0, 'Should find matching event');

    // 2. Date interval filter
    const from = new Date(Date.now() - 86400000).toISOString();
    const to = new Date(Date.now() + 30 * 86400000).toISOString();
    const dateRes = await api.get<{
      success: boolean;
      data: { events: Array<{ date: string }> };
    }>(`/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    assertStatus(dateRes.status, 200, 'Date filter');
    const allWithinBounds = dateRes.data.data.events.every((e) => {
      const evDate = new Date(e.date);
      return evDate >= new Date(from) && evDate <= new Date(to);
    });
    assert(allWithinBounds, 'All returned events must fall within requested date bounds');
  });

  await test('GET /events - Rejects malformed cursor parameter', async () => {
    const res = await api.get<{ success: boolean; error: { code: string } }>('/events?cursor=invalid_base64_string');
    assertStatus(res.status, 400, 'Malformed cursor');
    assertEqual(res.data.error.code, 'BAD_REQUEST');
  });
});

