import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const eventIdParamSchema = z.object({
  params: z.object({
    id: z
      .string({ required_error: 'Event ID parameter is required' })
      .regex(objectIdRegex, 'Invalid event ID format: must be a 24-character hexadecimal ObjectId')
  })
});

export const createEventSchema = z.object({
  body: z.object({
    title: z
      .string({ required_error: 'Title is required' })
      .trim()
      .min(2, 'Title must be at least 2 characters long')
      .max(200, 'Title cannot exceed 200 characters'),
    description: z
      .string()
      .trim()
      .max(2000, 'Description cannot exceed 2000 characters')
      .optional()
      .default(''),
    date: z
      .string({ required_error: 'Date is required' })
      .datetime({ message: 'Date must be a valid ISO 8601 datetime string' })
      .transform((val) => new Date(val)),
    price: z
      .number({ required_error: 'Price is required' })
      .min(0, 'Price cannot be negative'),
    totalSeats: z
      .number({ required_error: 'Total seats is required' })
      .int('Total seats must be an integer')
      .min(1, 'Total seats must be at least 1')
  })
});

export const updateEventSchema = z.object({
  params: z.object({
    id: z
      .string({ required_error: 'Event ID parameter is required' })
      .regex(objectIdRegex, 'Invalid event ID format')
  }),
  body: z
    .object({
      title: z
        .string()
        .trim()
        .min(2, 'Title must be at least 2 characters long')
        .max(200, 'Title cannot exceed 200 characters')
        .optional(),
      description: z
        .string()
        .trim()
        .max(2000, 'Description cannot exceed 2000 characters')
        .optional(),
      date: z
        .string()
        .datetime({ message: 'Date must be a valid ISO 8601 datetime string' })
        .transform((val) => new Date(val))
        .optional(),
      price: z
        .number()
        .min(0, 'Price cannot be negative')
        .optional(),
      totalSeats: z
        .number()
        .int('Total seats must be an integer')
        .min(1, 'Total seats must be at least 1')
        .optional()
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided for update'
    })
});

export const listEventsQuerySchema = z.object({
  query: z.object({
    limit: z
      .string()
      .optional()
      .default('10')
      .transform((val) => parseInt(val, 10))
      .refine((val) => !isNaN(val) && val >= 1 && val <= 50, {
        message: 'Limit must be an integer between 1 and 50'
      }),
    cursor: z.string().optional(),
    search: z.string().trim().optional(),
    from: z
      .string()
      .datetime({ message: "'from' must be a valid ISO 8601 datetime string" })
      .transform((val) => new Date(val))
      .optional(),
    to: z
      .string()
      .datetime({ message: "'to' must be a valid ISO 8601 datetime string" })
      .transform((val) => new Date(val))
      .optional()
  })
});

export type CreateEventInput = z.infer<typeof createEventSchema>['body'];
export type UpdateEventInput = z.infer<typeof updateEventSchema>['body'];
export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>['query'];

