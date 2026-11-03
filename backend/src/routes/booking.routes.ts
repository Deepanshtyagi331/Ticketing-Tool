import { Router } from 'express';
import { BookingController } from '../controllers/booking.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { bookingRateLimiter } from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validate.js';
import { createBookingSchema } from '../validators/booking.validator.js';

export const bookingRouter = Router();

// Protected: Authenticated users only, rate limited to 5 requests per minute per user
bookingRouter.post(
  '/',
  authenticate,
  bookingRateLimiter,
  validate(createBookingSchema),
  BookingController.create
);

