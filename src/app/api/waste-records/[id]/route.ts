import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireRole, resolveMessScope } from '@/lib/require-auth';
import { apiSuccess, apiError, withErrorHandling, ApiHttpError } from '@/lib/api-response';
import { updateWasteRecordSchema } from '@/lib/validation/waste-record';
import { computeWasteDerivedFields } from '@/lib/calculations';
import { dayOfWeekFromDate, weekTypeFromDate, toDateOnly, formatDateOnly } from '@/lib/date-utils';
import { getOrFetchWeather } from '@/lib/weather';

interface Params {
  params: { id: string };
}

export const GET = withErrorHandling(async (req: NextRequest, { params }: Params) => {
  const ctx = await requireAuth(req);

  const record = await prisma.wasteRecord.findUnique({
    where: { id: params.id },
    include: {
      mess: { select: { id: true, name: true, code: true } },
      menuSlot: true,
      createdBy: { select: { id: true, name: true } },
      updatedBy: { select: { id: true, name: true } },
    },
  });
  if (!record) throw new ApiHttpError('Waste record not found', 404);

  resolveMessScope(ctx, record.messId);

  return apiSuccess({ record });
});

// Data Collectors may edit records belonging to their own mess; Admins may
// edit any record. Deletion (below) is Admin-only per the spec.
export const PATCH = withErrorHandling(async (req: NextRequest, { params }: Params) => {
  const ctx = await requireAuth(req);

  const existing = await prisma.wasteRecord.findUnique({ where: { id: params.id } });
  if (!existing) throw new ApiHttpError('Waste record not found', 404);

  resolveMessScope(ctx, existing.messId);

  const body = await req.json().catch(() => null);
  const parsed = updateWasteRecordSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('Invalid request', 422, parsed.error.flatten());
  }
  const input = parsed.data;

  // A Data Collector may not move a record to a different mess.
  if (input.messId && ctx.role === 'DATA_COLLECTOR' && input.messId !== existing.messId) {
    throw new ApiHttpError('You can only edit records for your own mess', 403);
  }
  const messId = input.messId ?? existing.messId;

  const date = input.date ? toDateOnly(input.date) : existing.date;
  const mealSlot = input.mealSlot ?? existing.mealSlot;
  const dateOrMealChanged =
    formatDateOnly(date) !== formatDateOnly(existing.date) || mealSlot !== existing.mealSlot;

  if (dateOrMealChanged || messId !== existing.messId) {
    const duplicate = await prisma.wasteRecord.findUnique({
      where: { messId_date_mealSlot: { messId, date, mealSlot } },
    });
    if (duplicate && duplicate.id !== existing.id) {
      throw new ApiHttpError(
        'A waste record already exists for this mess/date/meal slot',
        409
      );
    }
  }

  const dayOfWeek = dateOrMealChanged ? dayOfWeekFromDate(date) : existing.dayOfWeek;
  const weekType = input.weekType ?? (dateOrMealChanged ? weekTypeFromDate(date) : existing.weekType);

  let menuSlotId = existing.menuSlotId;
  if (dateOrMealChanged || messId !== existing.messId || input.weekType) {
    const menuSlot = await prisma.menuSlot.findUnique({
      where: { messId_weekType_dayOfWeek_mealSlot: { messId, weekType, dayOfWeek, mealSlot } },
    });
    menuSlotId = menuSlot?.id ?? null;
  }

  let temperatureC = existing.temperatureC;
  let rainfallMm = existing.rainfallMm;
  if (dateOrMealChanged || messId !== existing.messId) {
    const mess = await prisma.mess.findUnique({ where: { id: messId } });
    if (!mess) throw new ApiHttpError('Mess not found', 404);
    const { weather } = await getOrFetchWeather(mess, date);
    temperatureC = weather?.temperatureMeanC ?? null;
    rainfallMm = weather?.rainMm ?? null;
  }

  const derived = computeWasteDerivedFields({
    plateWasteKg: input.plateWasteKg ?? existing.plateWasteKg,
    counterWasteKg: input.counterWasteKg ?? existing.counterWasteKg,
    packagingWasteKg: input.packagingWasteKg ?? existing.packagingWasteKg,
    headcount: input.headcount ?? existing.headcount,
    quantityPrepared: input.quantityPrepared ?? existing.quantityPrepared,
  });

  const scheduleDeviation = input.scheduleDeviation ?? existing.scheduleDeviation;
  if (scheduleDeviation && !(input.deviationReason ?? existing.deviationReason)) {
    throw new ApiHttpError('deviationReason is required when scheduleDeviation is true', 422);
  }

  const record = await prisma.wasteRecord.update({
    where: { id: params.id },
    data: {
      messId,
      date,
      mealSlot,
      weekType,
      dayOfWeek,
      menuSlotId,

      plateWasteKg: input.plateWasteKg ?? existing.plateWasteKg,
      counterWasteKg: input.counterWasteKg ?? existing.counterWasteKg,
      packagingWasteKg: input.packagingWasteKg ?? existing.packagingWasteKg,
      totalWasteKg: derived.totalWasteKg,

      headcount: input.headcount ?? existing.headcount,
      quantityPrepared: input.quantityPrepared ?? existing.quantityPrepared,
      quantityUnit: input.quantityUnit ?? existing.quantityUnit,
      totalIngredientCost: input.totalIngredientCost ?? existing.totalIngredientCost,

      wastePerPerson: derived.wastePerPerson,
      wastePercent: derived.wastePercent,

      temperatureC,
      rainfallMm,
      eventType: input.eventType ?? existing.eventType,

      scheduleDeviation,
      deviationReason: scheduleDeviation
        ? input.deviationReason ?? existing.deviationReason
        : null,
      // `undefined` = not sent (keep existing); `null`/'' = explicitly cleared.
      deviationDescription: scheduleDeviation
        ? input.deviationDescription === undefined
          ? existing.deviationDescription
          : input.deviationDescription
        : null,

      tags: input.tags ?? existing.tags,
      notes: input.notes === undefined ? existing.notes : input.notes,

      updatedById: ctx.userId,
    },
    include: {
      mess: { select: { id: true, name: true, code: true } },
      menuSlot: true,
      createdBy: { select: { id: true, name: true } },
      updatedBy: { select: { id: true, name: true } },
    },
  });

  return apiSuccess({ record });
});

// Delete is Admin-only per the spec ("Data Collector: submit + edit own
// mess's records only" — no delete).
export const DELETE = withErrorHandling(async (req: NextRequest, { params }: Params) => {
  const ctx = await requireAuth(req);
  requireRole(ctx, 'ADMIN');

  const existing = await prisma.wasteRecord.findUnique({ where: { id: params.id } });
  if (!existing) throw new ApiHttpError('Waste record not found', 404);

  await prisma.wasteRecord.delete({ where: { id: params.id } });
  return apiSuccess({ deleted: true });
});
