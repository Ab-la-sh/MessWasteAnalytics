import { z } from 'zod';
import type { MenuTag } from '@prisma/client';
import { MENU_TAGS } from '@/lib/constants';

// The cast has to preserve the MenuTag literal union, not widen to `string`.
// `as [string, ...string[]]` type-checks here but makes z.infer produce
// `string`, which then fails to satisfy Prisma's generated MenuTag[] at every
// call site that writes or filters on tags. Keeping MenuTag in the tuple type
// is what makes `z.infer<typeof menuTagSchema>` come back as MenuTag.
const menuTagValues = MENU_TAGS.map((t) => t.value) as [MenuTag, ...MenuTag[]];

export const menuTagSchema = z.enum(menuTagValues);
export const weekTypeSchema = z.enum(['A', 'B']);
export const dayOfWeekSchema = z.enum([
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
]);
export const mealSlotSchema = z.enum(['BREAKFAST', 'LUNCH', 'SNACKS', 'DINNER']);

export const createMenuSlotSchema = z.object({
  messId: z.string().cuid(),
  weekType: weekTypeSchema,
  dayOfWeek: dayOfWeekSchema,
  mealSlot: mealSlotSchema,
  itemCount: z.number().int().min(0),
  pctGravyDishes: z.number().min(0).max(100),
  hasBiryani: z.boolean().optional(),
  hasPaneer: z.boolean().optional(),
  hasEggBreakfast: z.boolean().optional(),
  hasDessert: z.boolean().optional(),
  hasDosa: z.boolean().optional(),
  hasParatha: z.boolean().optional(),
  tags: z.array(menuTagSchema).default([]),
  notes: z.string().optional().nullable(),
});

// Full replace on PATCH is allowed (including the identity fields), since an
// Admin correcting a typo'd day/slot is a legitimate edit — the route
// re-checks the unique constraint either way.
export const updateMenuSlotSchema = createMenuSlotSchema.partial();

export const menuSlotQuerySchema = z.object({
  messId: z.string().cuid().optional(),
  weekType: weekTypeSchema.optional(),
  dayOfWeek: dayOfWeekSchema.optional(),
  mealSlot: mealSlotSchema.optional(),
});

// Bulk copy of one mess/week's full schedule onto another mess/week.
export const copyMenuSchema = z
  .object({
    fromMessId: z.string().cuid(),
    fromWeekType: weekTypeSchema,
    toMessId: z.string().cuid(),
    toWeekType: weekTypeSchema,
    // false = keep any slot that already exists in the target; true = replace it.
    overwrite: z.boolean().default(false),
  })
  .refine((d) => d.fromMessId !== d.toMessId || d.fromWeekType !== d.toWeekType, {
    message: 'Source and destination must be different',
    path: ['toWeekType'],
  });

export type CopyMenuInput = z.infer<typeof copyMenuSchema>;
export type CreateMenuSlotInput = z.infer<typeof createMenuSlotSchema>;
export type UpdateMenuSlotInput = z.infer<typeof updateMenuSlotSchema>;
