import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const createBookingSchema = z.object({
  headers: z.object({
    'idempotency-key': z
      .string({ required_error: 'Idempotency-Key header is required' })
      .trim()
      .min(1, 'Idempotency-Key header cannot be empty')
  }),
  body: z.object({
    eventId: z
      .string({ required_error: 'eventId is required' })
      .regex(objectIdRegex, 'Invalid eventId format: must be a 24-character hexadecimal ObjectId'),
    seats: z
      .number({ required_error: 'seats is required' })
      .int('seats must be an integer')
      .min(1, 'Must book at least 1 seat')
  })
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>['body'];

