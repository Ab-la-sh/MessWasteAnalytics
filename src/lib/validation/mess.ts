import { z } from 'zod';
import { IIT_MADRAS_LOCATION } from '@/lib/constants';

export const createMessSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  code: z
    .string()
    .min(1, 'Code is required')
    .max(20)
    .regex(/^[A-Za-z0-9_-]+$/, 'Code may only contain letters, numbers, - and _'),
  // All mess halls in this deployment sit on the IIT Madras campus, so
  // coordinates default to it — override only if a mess is genuinely
  // elsewhere (weather is fetched per-mess from these exact coordinates).
  latitude: z.number().min(-90).max(90).default(IIT_MADRAS_LOCATION.latitude),
  longitude: z.number().min(-180).max(180).default(IIT_MADRAS_LOCATION.longitude),
  timezone: z.string().min(1).default(IIT_MADRAS_LOCATION.timezone),
  isActive: z.boolean().optional(),
});

export const updateMessSchema = createMessSchema.partial();

export type CreateMessInput = z.infer<typeof createMessSchema>;
export type UpdateMessInput = z.infer<typeof updateMessSchema>;
