import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    name: z
      .string({ required_error: 'Name is required' })
      .trim()
      .min(2, 'Name must be at least 2 characters')
      .max(100, 'Name cannot exceed 100 characters'),
    email: z
      .string({ required_error: 'Email is required' })
      .trim()
      .toLowerCase()
      .email('Please provide a valid email address'),
    password: z
      .string({ required_error: 'Password is required' })
      .min(8, 'Password must be at least 8 characters long')
      .max(100, 'Password cannot exceed 100 characters'),
    role: z
      .enum(['admin', 'user'], {
        errorMap: () => ({ message: "Role must be either 'admin' or 'user'" })
      })
      .optional()
      .default('user')
  })
});

export const loginSchema = z.object({
  body: z.object({
    email: z
      .string({ required_error: 'Email is required' })
      .trim()
      .toLowerCase()
      .email('Please provide a valid email address'),
    password: z
      .string({ required_error: 'Password is required' })
      .min(1, 'Password is required')
  })
});

export const refreshSchema = z.object({
  body: z
    .object({
      refreshToken: z.string().optional()
    })
    .optional()
});

export type RegisterInput = z.infer<typeof registerSchema>['body'];
export type LoginInput = z.infer<typeof loginSchema>['body'];

