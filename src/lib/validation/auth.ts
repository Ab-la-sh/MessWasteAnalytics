import { z } from 'zod';

// Emails are trimmed and lower-cased everywhere (login, signup, user
// management) so "Bob@x.com" and "bob@x.com" can never become two accounts
// or fail to match at sign-in.
export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address');

// bcrypt only uses the first 72 bytes, so longer passwords are rejected
// rather than silently truncated.
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Za-z]/, 'Password must contain at least one letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export const signupSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(8, 'Password must be at least 8 characters'),
    name: z.string().min(1, 'Name is required'),
    role: z.enum(['ADMIN', 'DATA_COLLECTOR']),
    messId: z.string().cuid().optional().nullable(),
  })
  .refine((data) => data.role === 'ADMIN' || !!data.messId, {
    message: 'messId is required for Data Collector accounts',
    path: ['messId'],
  });

// Self-service profile edit (PATCH /api/auth/me). Email, role and mess are
// deliberately not editable here — only an Admin changes those.
export const updateProfileSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long'),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: 'New password must be different from the current one',
    path: ['newPassword'],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
