import { z } from 'zod';
import { emailSchema, passwordSchema } from '@/lib/validation/auth';

const roleSchema = z.enum(['ADMIN', 'DATA_COLLECTOR']);
const nameSchema = z.string().trim().min(1, 'Name is required').max(100, 'Name is too long');

// A Data Collector must belong to a mess; an Admin never does. For Admins any
// messId that is sent is ignored (normalised to null by the routes) rather
// than rejected, so the UI can keep a stale mess selection around harmlessly.
export const createUserSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    role: roleSchema,
    messId: z.string().cuid().optional().nullable(),
  })
  .refine((d) => d.role === 'ADMIN' || !!d.messId, {
    message: 'Choose a mess for this Data Collector',
    path: ['messId'],
  });

// PATCH — every field optional. `password` here is an Admin-initiated reset.
export const updateUserSchema = z.object({
  name: nameSchema.optional(),
  email: emailSchema.optional(),
  role: roleSchema.optional(),
  messId: z.string().cuid().optional().nullable(),
  isActive: z.boolean().optional(),
  password: passwordSchema.optional(),
});

export const userQuerySchema = z.object({
  role: roleSchema.optional(),
  messId: z.string().cuid().optional(),
  search: z.string().trim().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
