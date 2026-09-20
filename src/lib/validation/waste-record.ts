import { z } from 'zod';
import { menuTagSchema, mealSlotSchema, weekTypeSchema } from '@/lib/validation/menu-slot';

const eventTypeSchema = z.enum(['NORMAL', 'HOLIDAY', 'FESTIVAL', 'COLLEGE_EVENT', 'EXAM_PERIOD']);
const quantityUnitSchema = z.enum(['KG', 'LITRES']);
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');

// Note: totalWasteKg, wastePerPerson, wastePercent, dayOfWeek and weekType
// (when not explicitly overridden) are never accepted from the client — they
// are always server-computed. temperatureC/rainfallMm are also server-filled
// from the WeatherDaily cache, never client-supplied.
export const createWasteRecordSchema = z.object({
  messId: z.string().cuid().optional(), // optional for Data Collectors (resolved from session)
  date: isoDateSchema,
  mealSlot: mealSlotSchema,
  weekType: weekTypeSchema.optional(), // auto-derived from date; pass to override

  plateWasteKg: z.number().min(0),
  counterWasteKg: z.number().min(0),
  packagingWasteKg: z.number().min(0),

  headcount: z.number().int().min(0),
  quantityPrepared: z.number().min(0),
  quantityUnit: quantityUnitSchema.default('KG'),
  totalIngredientCost: z.number().min(0),

  eventType: eventTypeSchema.default('NORMAL'),

  scheduleDeviation: z.boolean().default(false),
  deviationReason: z.string().optional().nullable(),
  deviationDescription: z.string().optional().nullable(),

  tags: z.array(menuTagSchema).default([]),
  notes: z.string().optional().nullable(),
});

export const updateWasteRecordSchema = createWasteRecordSchema.partial();

export const wasteRecordQuerySchema = z.object({
  messId: z.string().cuid().optional(),
  mealSlot: mealSlotSchema.optional(),
  weekType: weekTypeSchema.optional(),
  dayOfWeek: z
    .enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'])
    .optional(),
  eventType: eventTypeSchema.optional(),
  // Not z.coerce.boolean() — that does `Boolean(str)`, so the string
  // "false" (truthy as a non-empty string) would incorrectly become `true`.
  scheduleDeviation: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  dateFrom: isoDateSchema.optional(),
  dateTo: isoDateSchema.optional(),
  tags: z
    .union([z.array(menuTagSchema), menuTagSchema])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sortBy: z
    .enum([
      'date',
      'totalWasteKg',
      'wastePerPerson',
      'wastePercent',
      'headcount',
      'quantityPrepared',
      'totalIngredientCost',
      'createdAt',
    ])
    .default('date'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export type CreateWasteRecordInput = z.infer<typeof createWasteRecordSchema>;
export type UpdateWasteRecordInput = z.infer<typeof updateWasteRecordSchema>;
export type WasteRecordQuery = z.infer<typeof wasteRecordQuerySchema>;
