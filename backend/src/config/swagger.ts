import { Router } from 'express';
import type { Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import { env } from './env.js';

const swaggerDefinition = {
  openapi: '3.0.3',
  info: {
    title: 'Event Ticket Booking System API',
    version: '1.0.0',
    description:
      'Production-ready Event Ticket Booking API built with Node.js, Express, TypeScript, and MongoDB. Features atomic conditional inventory updates, 10-minute seat holds, HMAC-SHA256 payment webhooks, refresh token rotation with reuse detection, and revenue aggregation reporting.',
    contact: {
      name: 'Ticket Booking Engineering Team',
    },
  },
  servers: [
    {
      url: `http://localhost:${env.PORT}`,
      description: 'Local development server',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: '15-minute access token passed via Authorization: Bearer <token>',
      },
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'refreshToken',
        description: '7-day HttpOnly refresh token cookie',
      },
      idempotencyKey: {
        type: 'apiKey',
        in: 'header',
        name: 'Idempotency-Key',
        description: 'Client-generated UUID idempotency key for booking operations',
      },
      hmacSignature: {
        type: 'apiKey',
        in: 'header',
        name: 'x-signature',
        description: 'HMAC-SHA256 signature calculated over raw request body',
      },
    },
    schemas: {
      ApiResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: { type: 'object' },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'VALIDATION_ERROR' },
              message: { type: 'string', example: 'Invalid request payload' },
              details: { type: 'object' },
            },
            required: ['code', 'message'],
          },
        },
        required: ['success', 'error'],
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '674e2d83b5f92c103e4812a1' },
          name: { type: 'string', example: 'Jane Doe' },
          email: { type: 'string', format: 'email', example: 'jane@example.com' },
          role: { type: 'string', enum: ['user', 'admin'], example: 'user' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Event: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '674e2d83b5f92c103e4812b2' },
          title: { type: 'string', example: 'Tech Innovation Summit 2026' },
          description: { type: 'string', example: 'Annual flagship engineering conference' },
          date: { type: 'string', format: 'date-time', example: '2026-12-15T09:00:00.000Z' },
          price: { type: 'number', example: 149.99 },
          totalSeats: { type: 'integer', example: 500 },
          availableSeats: { type: 'integer', example: 480 },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Booking: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '674e2d83b5f92c103e4812c3' },
          userId: { type: 'string', example: '674e2d83b5f92c103e4812a1' },
          eventId: { type: 'string', example: '674e2d83b5f92c103e4812b2' },
          seats: { type: 'integer', example: 2 },
          amount: { type: 'number', example: 299.98 },
          status: { type: 'string', enum: ['PENDING', 'CONFIRMED', 'EXPIRED'], example: 'PENDING' },
          idempotencyKey: { type: 'string', example: 'a9b2447f-f772-4e4b-9df2-51ab9c86a100' },
          expiresAt: { type: 'string', format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  tags: [
    { name: 'Health', description: 'System health and readiness diagnostics' },
    { name: 'Auth', description: 'Authentication, sessions, and token lifecycle' },
    { name: 'Events', description: 'Event catalog, cursor pagination, search, and admin controls' },
    { name: 'Bookings', description: 'Atomic conditional seat reservation and idempotency' },
    { name: 'Payments', description: 'Payment webhook and HMAC signature verification' },
    { name: 'Admin', description: 'Administrative analytics and revenue reporting' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'System health check',
        description: 'Returns the health status of the application and MongoDB database connection.',
        responses: {
          '200': {
            description: 'System is fully healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    timestamp: { type: 'string', format: 'date-time' },
                    uptime: { type: 'number', example: 42.1 },
                    database: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', example: 'connected' },
                        state: { type: 'number', example: 1 },
                      },
                    },
                  },
                },
              },
            },
          },
          '503': {
            description: 'Database connection is degraded or disconnected',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a new user account',
        description: 'Creates a new user with bcrypt-hashed credentials and returns authentication tokens.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'password'],
                properties: {
                  name: { type: 'string', example: 'Jane Doe' },
                  email: { type: 'string', format: 'email', example: 'jane@example.com' },
                  password: { type: 'string', format: 'password', minLength: 8, example: 'SecurePassword123!' },
                  role: { type: 'string', enum: ['user', 'admin'], default: 'user' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'User registered successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        user: { $ref: '#/components/schemas/User' },
                        accessToken: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Validation failed or duplicate email address',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Authenticate and receive tokens',
        description: 'Authenticates user credentials, sets an HttpOnly refresh cookie, and returns a 15-minute access token.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'jane@example.com' },
                  password: { type: 'string', format: 'password', example: 'SecurePassword123!' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Authentication successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        user: { $ref: '#/components/schemas/User' },
                        accessToken: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Invalid email or password',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Rotate refresh token and issue fresh access token',
        description: 'Rotates the refresh token (replay attack detection wipes family if reused). Accepts token from HttpOnly cookie or request body.',
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  refreshToken: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Tokens successfully rotated',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        accessToken: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Refresh token expired, invalid, or reused',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Revoke session and clear refresh cookie',
        description: 'Marks current refresh token as revoked and clears the HttpOnly cookie.',
        responses: {
          '200': {
            description: 'Successfully logged out',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        message: { type: 'string', example: 'Logged out successfully' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Get current authenticated user profile',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Current user profile',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        user: { $ref: '#/components/schemas/User' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized or missing/expired access token',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/events': {
      get: {
        tags: ['Events'],
        summary: 'List events with cursor-based pagination and filtering',
        description: 'Returns events ordered by date and id using indexed cursor pagination (no skip()). Supports date bounds and text search on title.',
        parameters: [
          {
            name: 'cursor',
            in: 'query',
            description: 'Base64 encoded pagination cursor',
            schema: { type: 'string' },
          },
          {
            name: 'limit',
            in: 'query',
            description: 'Number of events to retrieve (max 50, default 10)',
            schema: { type: 'integer', default: 10, maximum: 50 },
          },
          {
            name: 'from',
            in: 'query',
            description: 'ISO 8601 start date filter',
            schema: { type: 'string', format: 'date-time' },
          },
          {
            name: 'to',
            in: 'query',
            description: 'ISO 8601 end date filter',
            schema: { type: 'string', format: 'date-time' },
          },
          {
            name: 'search',
            in: 'query',
            description: 'Text search query for event title',
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Paginated event list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        events: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Event' },
                        },
                        pagination: {
                          type: 'object',
                          properties: {
                            nextCursor: { type: 'string', nullable: true },
                            hasMore: { type: 'boolean' },
                            limit: { type: 'integer' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Events'],
        summary: 'Create a new event (Admin only)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title', 'date', 'price', 'totalSeats'],
                properties: {
                  title: { type: 'string', example: 'Cloud Architecture Summit 2026' },
                  description: { type: 'string', example: 'Comprehensive cloud architecture deep dive' },
                  date: { type: 'string', format: 'date-time', example: '2026-11-20T10:00:00.000Z' },
                  price: { type: 'number', minimum: 0, example: 99.00 },
                  totalSeats: { type: 'integer', minimum: 1, example: 250 },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Event created successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        event: { $ref: '#/components/schemas/Event' },
                      },
                    },
                  },
                },
              },
            },
          },
          '403': {
            description: 'Forbidden - requires admin privileges',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/events/{id}': {
      get: {
        tags: ['Events'],
        summary: 'Get event details by ID',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'MongoDB ObjectId of the event',
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Event details',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        event: { $ref: '#/components/schemas/Event' },
                      },
                    },
                  },
                },
              },
            },
          },
          '404': {
            description: 'Event not found',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
      patch: {
        tags: ['Events'],
        summary: 'Update event metadata or inventory (Admin only)',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'MongoDB ObjectId of the event',
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  date: { type: 'string', format: 'date-time' },
                  price: { type: 'number', minimum: 0 },
                  totalSeats: { type: 'integer', minimum: 1 },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Event updated successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        event: { $ref: '#/components/schemas/Event' },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Validation failed or attempt to reduce totalSeats below committed seats',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/bookings': {
      post: {
        tags: ['Bookings'],
        summary: 'Reserve seats with atomic conditional update and 10-minute hold',
        description: 'Creates a PENDING booking holding inventory for 10 minutes. Requires Idempotency-Key header. Rate limited to 5 requests/minute per authenticated user.',
        security: [{ bearerAuth: [] }, { idempotencyKey: [] }],
        parameters: [
          {
            name: 'Idempotency-Key',
            in: 'header',
            required: true,
            description: 'Unique UUID idempotency token',
            schema: { type: 'string', example: 'a9b2447f-f772-4e4b-9df2-51ab9c86a100' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['eventId', 'seats'],
                properties: {
                  eventId: { type: 'string', example: '674e2d83b5f92c103e4812b2' },
                  seats: { type: 'integer', minimum: 1, maximum: 10, example: 2 },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Seats held successfully in PENDING status',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        booking: { $ref: '#/components/schemas/Booking' },
                      },
                    },
                  },
                },
              },
            },
          },
          '200': {
            description: 'Idempotent replay: original booking returned without double-holding seats',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        booking: { $ref: '#/components/schemas/Booking' },
                        idempotentReplay: { type: 'boolean', example: true },
                      },
                    },
                  },
                },
              },
            },
          },
          '409': {
            description: 'Insufficient inventory available for requested seats',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          '429': {
            description: 'Rate limit exceeded (maximum 5 requests per minute per user)',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/bookings/my': {
      get: {
        tags: ['Bookings'],
        summary: 'List all bookings for current user',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'List of user bookings',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        bookings: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Booking' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/bookings/{id}': {
      get: {
        tags: ['Bookings'],
        summary: 'Get booking status by ID',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'MongoDB ObjectId of the booking',
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Booking details',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        booking: { $ref: '#/components/schemas/Booking' },
                      },
                    },
                  },
                },
              },
            },
          },
          '404': {
            description: 'Booking not found',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/payments/webhook': {
      post: {
        tags: ['Payments'],
        summary: 'Process mock payment gateway webhook',
        description: 'Verifies HMAC-SHA256 signature calculated over raw request body using timingSafeEqual. Confirms eligible PENDING bookings. Applies Late Payment Policy for expired bookings.',
        security: [{ hmacSignature: [] }],
        parameters: [
          {
            name: 'x-signature',
            in: 'header',
            required: true,
            description: 'HMAC-SHA256 signature in hexadecimal',
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['bookingId', 'paymentStatus', 'transactionId', 'amount', 'currency'],
                properties: {
                  bookingId: { type: 'string', example: '674e2d83b5f92c103e4812c3' },
                  paymentStatus: { type: 'string', enum: ['SUCCESS', 'FAILED'], example: 'SUCCESS' },
                  transactionId: { type: 'string', example: 'txn_mock_987654321' },
                  amount: { type: 'number', example: 299.98 },
                  currency: { type: 'string', example: 'USD' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Webhook processed successfully or duplicate handled safely',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', example: 'confirmed' },
                        bookingId: { type: 'string' },
                        transactionId: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Invalid webhook payload or signature mismatch',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/admin/reports/revenue': {
      get: {
        tags: ['Admin'],
        summary: 'Event revenue aggregation report (Admin only)',
        description: 'Aggregates confirmed bookings by event, calculating total seats sold, gross revenue, and overall platform metrics across an optional date range.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'from',
            in: 'query',
            description: 'ISO 8601 start date',
            schema: { type: 'string', format: 'date-time' },
          },
          {
            name: 'to',
            in: 'query',
            description: 'ISO 8601 end date',
            schema: { type: 'string', format: 'date-time' },
          },
        ],
        responses: {
          '200': {
            description: 'Revenue aggregation report',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        events: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              eventId: { type: 'string' },
                              eventTitle: { type: 'string' },
                              eventDate: { type: 'string', format: 'date-time' },
                              totalBookings: { type: 'integer' },
                              totalSeatsSold: { type: 'integer' },
                              totalRevenue: { type: 'number' },
                            },
                          },
                        },
                        summary: {
                          type: 'object',
                          properties: {
                            totalEventsWithBookings: { type: 'integer' },
                            totalConfirmedBookings: { type: 'integer' },
                            totalSeatsSold: { type: 'integer' },
                            totalRevenue: { type: 'number' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '403': {
            description: 'Forbidden - requires admin privileges',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
  },
};

const swaggerOptions: swaggerJsdoc.Options = {
  definition: swaggerDefinition,
  apis: [], // All definitions and paths are explicitly declared above
};

export const swaggerSpec = swaggerJsdoc(swaggerOptions);

export const swaggerRouter = Router();

// OpenAPI Specification in JSON format (registered before UI)
swaggerRouter.get('/api-docs.json', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json(swaggerSpec);
});

// Swagger UI mount
swaggerRouter.use(
  '/api-docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Ticket Booking API Documentation',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      docExpansion: 'list',
      filter: true,
    },
  })
);

