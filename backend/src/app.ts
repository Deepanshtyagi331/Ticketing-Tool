import express from 'express';
import type { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { healthRouter } from './routes/health.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { eventRouter } from './routes/event.routes.js';
import { bookingRouter } from './routes/booking.routes.js';
import { paymentRouter } from './routes/payment.routes.js';
import { adminRouter } from './routes/admin.routes.js';
import { swaggerRouter } from './config/swagger.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { errorHandler } from './middleware/errorHandler.js';

export const createApp = (): Express => {
  const app = express();

  // Request ID & Structured Access Logging Middleware
  app.use(requestIdMiddleware);

  // Security Middleware
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
    })
  );
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'x-signature', 'x-webhook-signature']
    })
  );

  // Parsing Middleware (preserving raw buffer for cryptographic HMAC verification)
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        (req as { rawBody?: Buffer }).rawBody = buf;
      }
    })
  );
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // Health Check Endpoint
  app.use(healthRouter);

  // Authentication Routes
  app.use('/auth', authRouter);
  app.use('/api/auth', authRouter);

  // Event Management Routes
  app.use('/events', eventRouter);
  app.use('/api/events', eventRouter);

  // Booking Engine Routes
  app.use('/bookings', bookingRouter);
  app.use('/api/bookings', bookingRouter);

  // Payment Webhook Routes
  app.use('/payments', paymentRouter);
  app.use('/api/payments', paymentRouter);

  // Administrative & Reporting Routes
  app.use('/admin', adminRouter);
  app.use('/api/admin', adminRouter);

  // OpenAPI Specification & Swagger UI Documentation
  app.use(swaggerRouter);

  // 404 handler
  app.use(notFoundHandler);

  // Centralized Error handler
  app.use(errorHandler);

  return app;
};
