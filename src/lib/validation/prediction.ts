import { z } from 'zod';
import { isoDateSchema } from '@/lib/validation/analytics';
import { mealSlotSchema } from '@/lib/validation/menu-slot';

const eventTypeSchema = z.enum(['NORMAL', 'HOLIDAY', 'FESTIVAL', 'COLLEGE_EVENT', 'EXAM_PERIOD']);

const boolStringSchema = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => v === 'true');

// GET /api/predict — a single meal.
//
// messId is required (a prediction is always for one mess's kitchen), and so
// are date + mealSlot. Everything else is optional context the Data Collection
// form can pass as the coordinator fills the form in: known headcount sharpens
// the kilogram estimate, and the deviation toggle / event dropdown let the
// prediction react live to what's actually being entered. Weather is never
// accepted from the client — the server reads it from WeatherDaily itself.
export const predictQuerySchema = z.object({
  messId: z.string().cuid(),
  date: isoDateSchema,
  mealSlot: mealSlotSchema,
  headcount: z.coerce.number().int().min(0).optional(),
  eventType: eventTypeSchema.optional(),
  scheduleDeviation: boolStringSchema,
});

// GET /api/predict/forecast — the next N days, all meal slots.
//
// messId optional: omitted means the combined view (predict each mess
// separately, then sum), matching how every other analytics route treats a
// missing messId.
export const forecastQuerySchema = z.object({
  messId: z.string().cuid().optional(),
  days: z.coerce.number().int().min(1).max(14).default(7),
});

export const notificationsQuerySchema = z.object({
  messId: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type PredictQuery = z.infer<typeof predictQuerySchema>;
export type ForecastQuery = z.infer<typeof forecastQuerySchema>;
export type NotificationsQuery = z.infer<typeof notificationsQuerySchema>;
