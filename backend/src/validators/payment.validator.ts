import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const paymentWebhookSchema = z.object({
  body: z.object({
    event: z.enum(['payment.succeeded', 'payment.failed'], {
      errorMap: () => ({ message: "event must be either 'payment.succeeded' or 'payment.failed'" })
    }),
    bookingId: z
      .string({ required_error: 'bookingId is required' })
      .regex(objectIdRegex, 'Invalid bookingId format'),
    paymentId: z
      .string({ required_error: 'paymentId is required' })
      .min(1, 'paymentId cannot be empty'),
    amount: z
      .number({ required_error: 'amount is required' })
      .min(0, 'amount cannot be negative')
  })
});

export type PaymentWebhookInput = z.infer<typeof paymentWebhookSchema>['body'];

