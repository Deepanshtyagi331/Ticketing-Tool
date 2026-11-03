import request from 'supertest';
import { createApp } from '../src/app';

describe('Health Check Endpoint', () => {
  const app = createApp();

  it('GET /health should return 200/503 status payload', async () => {
    const res = await request(app).get('/health');
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('database');
  });

  it('GET /non-existent-route should return 404 with structured error', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('GET /api-docs.json should return 200 with OpenAPI specification JSON', async () => {
    const res = await request(app).get('/api-docs.json');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toHaveProperty('openapi', '3.0.3');
    expect(res.body).toHaveProperty('info');
    expect(res.body.info.title).toBe('Event Ticket Booking System API');
    expect(res.body).toHaveProperty('paths');
    expect(res.body.paths).toHaveProperty('/health');
    expect(res.body.paths).toHaveProperty('/auth/login');
    expect(res.body.paths).toHaveProperty('/events');
    expect(res.body.paths).toHaveProperty('/bookings');
    expect(res.body.paths).toHaveProperty('/payments/webhook');
  });

  it('GET /api-docs/ should serve Swagger UI HTML', async () => {
    const res = await request(app).get('/api-docs/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('id="swagger-ui"');
    expect(res.text).toContain('swagger-ui-bundle.js');
  });

  it('GET /api-docs should redirect to /api-docs/ or serve Swagger UI', async () => {
    const res = await request(app).get('/api-docs');
    expect([200, 301]).toContain(res.status);
    if (res.status === 301) {
      expect(res.headers.location).toMatch(/\/api-docs\//);
    }
  });
});
