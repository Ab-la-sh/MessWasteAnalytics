import { z } from 'zod';
import { mealSlotSchema, weekTypeSchema, dayOfWeekSchema, menuTagSchema } from '@/lib/validation/menu-slot';

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');

// Shared by every analytics endpoint: messId omitted means "combined across
// all messes" (Admins) — resolveMessScope forces it to the caller's own mess
// for Data Collectors regardless of what's passed here. dateFrom/dateTo
// omitted means "all available data" (this is a demo dataset covering a
// fixed historical year, not a live-only window).
export const analyticsBaseQuerySchema = z.object({
  messId: z.string().cuid().optional(),
  dateFrom: isoDateSchema.optional(),
  dateTo: isoDateSchema.optional(),
});

const boolStringSchema = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => v === 'true');

export const trendsQuerySchema = analyticsBaseQuerySchema.extend({
  granularity: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
  // Only meaningful (and only honoured) for the combined/all-mess view —
  // adds a per-mess breakdown alongside the combined series.
  splitByMess: boolStringSchema,
});

export const breakdownQuerySchema = analyticsBaseQuerySchema.extend({
  by: z.enum(['mealSlot', 'dayOfWeek', 'weekType', 'eventType']).default('mealSlot'),
});

export const correlationQuerySchema = analyticsBaseQuerySchema.extend({
  metric: z.enum(['quantityPrepared', 'totalIngredientCost']).default('quantityPrepared'),
  limit: z.coerce.number().int().min(1).max(2000).default(500),
});

export const summaryQuerySchema = z.object({
  messId: z.string().cuid().optional(),
});

export const anomaliesQuerySchema = analyticsBaseQuerySchema.extend({
  // z-score cutoff on wastePercent within its (mess, mealSlot) baseline.
  thresholdStdDev: z.coerce.number().min(0.5).max(5).default(1.5),
  limit: z.coerce.number().int().min(1).max(200).default(20),
});

export const insightsQuerySchema = analyticsBaseQuerySchema;

// Backs the Data Collection form's "Historical Insight" line. Needs either
// an explicit date (dayOfWeek/weekType derived from it) or both dayOfWeek
// and weekType directly (e.g. for a what-if lookup with no date in mind yet).
export const historicalAverageQuerySchema = z
  .object({
    messId: z.string().cuid(),
    mealSlot: mealSlotSchema,
    date: isoDateSchema.optional(),
    dayOfWeek: dayOfWeekSchema.optional(),
    weekType: weekTypeSchema.optional(),
    tags: z
      .union([z.array(menuTagSchema), menuTagSchema])
      .optional()
      .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  })
  .refine((v) => v.date || (v.dayOfWeek && v.weekType), {
    message: 'Provide either date, or both dayOfWeek and weekType',
  });

export type TrendsQuery = z.infer<typeof trendsQuerySchema>;
export type BreakdownQuery = z.infer<typeof breakdownQuerySchema>;
export type CorrelationQuery = z.infer<typeof correlationQuerySchema>;
export type AnomaliesQuery = z.infer<typeof anomaliesQuerySchema>;
export type HistoricalAverageQuery = z.infer<typeof historicalAverageQuerySchema>;
