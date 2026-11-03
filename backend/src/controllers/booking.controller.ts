import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types/auth.types.js';
import { BookingService } from '../services/booking.service.js';
import { AppError } from '../errors/AppError.js';

export class BookingController {
  public static async create(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const user = req.user;
      if (!user) {
        throw AppError.unauthorized('Authentication required to create a booking');
      }

      const idempotencyKey = req.headers['idempotency-key'] as string;
      if (!idempotencyKey || idempotencyKey.trim().length === 0) {
        throw AppError.badRequest('Idempotency-Key header is required');
      }

      const { eventId, seats } = req.body as { eventId: string; seats: number };

      const result = await BookingService.createBooking(
        user.id,
        eventId,
        seats,
        idempotencyKey.trim()
      );

      res.status(result.isRetry ? 200 : 201).json({
        success: true,
        data: {
          booking: result.booking,
          isRetry: result.isRetry
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

