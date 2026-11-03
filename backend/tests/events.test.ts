import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app';
import { User, Event } from '../src/models';

const TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/ticket_booking_events_test';
const app = createApp();

let adminToken: string;
let userToken: string;

beforeAll(async () => {
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
  await Promise.all([User.syncIndexes(), Event.syncIndexes()]);

  // Create admin user
  const adminRes = await request(app).post('/auth/register').send({
    name: 'Admin User',
    email: 'admin_events@example.com',
    password: 'Password123!',
    role: 'admin'
  });
  adminToken = adminRes.body.data.accessToken;

  // Create regular user
  const userRes = await request(app).post('/auth/register').send({
    name: 'Normal User',
    email: 'normal_events@example.com',
    password: 'Password123!',
    role: 'user'
  });
  userToken = userRes.body.data.accessToken;
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

beforeEach(async () => {
  await Event.deleteMany({});
});

describe('Event Management Suite', () => {
  const sampleEvent = {
    title: 'Summer Music Festival 2026',
    description: 'Annual outdoor festival featuring international artists',
    date: new Date(Date.now() + 7 * 86400000).toISOString(),
    price: 85.5,
    totalSeats: 200
  };

  describe('POST /events (Event Creation)', () => {
    it('should allow admin to create an event with availableSeats equal to totalSeats', async () => {
      const res = await request(app)
        .post('/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(sampleEvent);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.event.title).toBe(sampleEvent.title);
      expect(res.body.data.event.totalSeats).toBe(200);
      expect(res.body.data.event.availableSeats).toBe(200); // availableSeats matches totalSeats initially
      expect(res.body.data.event.price).toBe(85.5);
    });

    it('should forbid regular users from creating events with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/events')
        .set('Authorization', `Bearer ${userToken}`)
        .send(sampleEvent);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should reject unauthenticated request with 401 Unauthorized', async () => {
      const res = await request(app).post('/events').send(sampleEvent);
      expect(res.status).toBe(401);
    });

    it('should reject invalid event inputs (negative price or 0 seats)', async () => {
      const res = await request(app)
        .post('/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          ...sampleEvent,
          price: -10,
          totalSeats: 0
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PATCH /events/:id (Event Update & Inventory Protection)', () => {
    let eventId: string;

    beforeEach(async () => {
      const created = await Event.create({
        ...sampleEvent,
        date: new Date(sampleEvent.date),
        availableSeats: sampleEvent.totalSeats
      });
      eventId = created._id.toString();
    });

    it('should allow admin to update event details and expand inventory', async () => {
      const res = await request(app)
        .patch(`/events/${eventId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Updated Festival Title',
          totalSeats: 250
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.event.title).toBe('Updated Festival Title');
      expect(res.body.data.event.totalSeats).toBe(250);
      expect(res.body.data.event.availableSeats).toBe(250);
    });

    it('should prevent reducing totalSeats below already committed inventory', async () => {
      // Simulate that 150 seats are already booked (leaving 50 available)
      await Event.findByIdAndUpdate(eventId, { availableSeats: 50 });

      // Attempting to reduce totalSeats to 100 when 150 are committed must fail
      const res = await request(app)
        .patch(`/events/${eventId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ totalSeats: 100 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/booked or reserved/i);
    });

    it('should forbid regular users from updating events with 403 Forbidden', async () => {
      const res = await request(app)
        .patch(`/events/${eventId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'Hacked Title' });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /events/:id (Single Event Retrieval)', () => {
    it('should retrieve event by valid ID', async () => {
      const created = await Event.create({
        ...sampleEvent,
        date: new Date(sampleEvent.date),
        availableSeats: sampleEvent.totalSeats
      });

      const res = await request(app).get(`/events/${created._id}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.event.title).toBe(sampleEvent.title);
    });

    it('should reject invalid ObjectId format with 400 Bad Request', async () => {
      const res = await request(app).get('/events/invalid-hex-id-123');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 404 for non-existent ObjectId', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app).get(`/events/${fakeId}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /events (Public Listing, Cursor Pagination & Filtering)', () => {
    beforeEach(async () => {
      // Seed 5 events with distinct sequential dates
      const baseTime = Date.now() + 86400000;
      const eventsToSeed = [
        {
          title: 'Jazz Evening Jazz Club',
          date: new Date(baseTime + 1 * 86400000),
          price: 40,
          totalSeats: 100,
          availableSeats: 100
        },
        {
          title: 'Classical Symphony Concert',
          date: new Date(baseTime + 2 * 86400000),
          price: 75,
          totalSeats: 150,
          availableSeats: 150
        },
        {
          title: 'Tech Innovation Summit',
          date: new Date(baseTime + 3 * 86400000),
          price: 299,
          totalSeats: 500,
          availableSeats: 500
        },
        {
          title: 'Standup Comedy Showcase',
          date: new Date(baseTime + 4 * 86400000),
          price: 35,
          totalSeats: 80,
          availableSeats: 80
        },
        {
          title: 'Food & Wine Expo',
          date: new Date(baseTime + 5 * 86400000),
          price: 50,
          totalSeats: 200,
          availableSeats: 200
        }
      ];

      await Event.insertMany(eventsToSeed);
    });

    it('should support cursor-based pagination without skip()', async () => {
      // Fetch Page 1 with limit=2
      const page1 = await request(app).get('/events?limit=2');
      expect(page1.status).toBe(200);
      expect(page1.body.data.events.length).toBe(2);
      expect(page1.body.data.pagination.hasMore).toBe(true);
      expect(page1.body.data.pagination.nextCursor).toBeDefined();

      const cursor1 = page1.body.data.pagination.nextCursor;

      // Fetch Page 2 with limit=2 using cursor1
      const page2 = await request(app).get(`/events?limit=2&cursor=${cursor1}`);
      expect(page2.status).toBe(200);
      expect(page2.body.data.events.length).toBe(2);
      expect(page2.body.data.pagination.hasMore).toBe(true);

      // Verify no overlap between page 1 and page 2
      const page1Titles = page1.body.data.events.map((e: any) => e.title);
      const page2Titles = page2.body.data.events.map((e: any) => e.title);
      for (const t of page2Titles) {
        expect(page1Titles).not.toContain(t);
      }

      // Fetch Page 3 (remaining 1 item)
      const cursor2 = page2.body.data.pagination.nextCursor;
      const page3 = await request(app).get(`/events?limit=2&cursor=${cursor2}`);
      expect(page3.status).toBe(200);
      expect(page3.body.data.events.length).toBe(1);
      expect(page3.body.data.pagination.hasMore).toBe(false);
      expect(page3.body.data.pagination.nextCursor).toBeNull();
    });

    it('should filter events by date range (from and to)', async () => {
      const baseTime = Date.now() + 86400000;
      const from = new Date(baseTime + 1.5 * 86400000).toISOString();
      const to = new Date(baseTime + 3.5 * 86400000).toISOString();

      const res = await request(app).get(`/events?from=${from}&to=${to}`);
      expect(res.status).toBe(200);
      // Events 2 and 3 fall into this window
      expect(res.body.data.events.length).toBe(2);
      const titles = res.body.data.events.map((e: any) => e.title);
      expect(titles).toContain('Classical Symphony Concert');
      expect(titles).toContain('Tech Innovation Summit');
    });

    it('should perform search filtering by title', async () => {
      const res = await request(app).get('/events?search=Comedy');
      expect(res.status).toBe(200);
      expect(res.body.data.events.length).toBe(1);
      expect(res.body.data.events[0].title).toBe('Standup Comedy Showcase');
    });

    it('should reject invalid cursor with 400 Bad Request', async () => {
      const res = await request(app).get('/events?cursor=malformed_non_base64_not_json');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    });
  });
});

