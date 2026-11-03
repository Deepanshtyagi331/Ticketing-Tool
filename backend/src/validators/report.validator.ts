import { z } from 'zod';

export const revenueReportSchema = z.object({
  query: z
    .object({
      from: z
        .string({ required_error: "'from' date query parameter is required" })
        .datetime({ message: "'from' must be a valid ISO 8601 datetime string" })
        .transform((val) => new Date(val)),
      to: z
        .string({ required_error: "'to' date query parameter is required" })
        .datetime({ message: "'to' must be a valid ISO 8601 datetime string" })
        .transform((val) => new Date(val))
    })
    .refine((data) => data.from <= data.to, {
      message: "'from' date must be less than or equal to 'to' date",
      path: ['from']
    })
});

export type RevenueReportQuery = z.infer<typeof revenueReportSchema>['query'];

