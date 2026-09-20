import { z } from 'zod';

export const weatherQuerySchema = z.object({
  messId: z.string().cuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
});

export type WeatherQuery = z.infer<typeof weatherQuerySchema>;
