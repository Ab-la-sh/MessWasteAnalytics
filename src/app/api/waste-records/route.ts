import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth, resolveMessScope } from '@/lib/require-auth';
import { apiSuccess, apiError, withErrorHandling, ApiHttpError } from '@/lib/api-response';
import { createWasteRecordSchema, wasteRecordQuerySchema } from '@/lib/validation/waste-record';
import { searchParamsToObject } from '@/lib/query';
import { computeWasteDerivedFields } from '@/lib/calculations';
import { dayOfWeekFromDate, weekTypeFromDate, toDateOnly } from '@/lib/date-utils';
import { getOrFetchWeather } from '@/lib/weather';
import type { PaginatedData } from '@/types/api';

// GET /api/waste-records — searchable, sortable, paginated list backing the
// Records page. Data Collectors are always confined to their own mess.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const ctx = await requireAuth(req);

  const parsed = wasteRecordQuerySchema.safeParse(searchParamsToObject(req));
  if (!parsed.success) {
    return apiError('Invalid query parameters', 422, parsed.error.flatten());
  }
  const q = parsed.data;

  const messId = resolveMessScope(ctx, q.messId ?? null);

  const where: Prisma.WasteRecordWhereInput = {
    ...(messId ? { messId } : {}),
    ...(q.mealSlot ? { mealSlot: q.mealSlot } : {}),
    ...(q.weekType ? { weekType: q.weekType } : {}),
    ...(q.dayOfWeek ? { dayOfWeek: q.dayOfWeek } : {}),
    ...(q.eventType ? { eventType: q.eventType } : {}),
    ...(q.scheduleDeviation !== undefined ? { scheduleDeviation: q.scheduleDeviation } : {}),
    ...(q.tags && q.tags.length > 0 ? { tags: { hasSome: q.tags } } : {}),
    ...(q.dateFrom || q.dateTo
      ? {
          date: {
            ...(q.dateFrom ? { gte: toDateOnly(q.dateFrom) } : {}),
            ...(q.dateTo ? { lte: toDateOnly(q.dateTo) } : {}),
          },
        }
      : {}),
    ...(q.search
      ? {
          OR: [
            { notes: { contains: q.search, mode: 'insensitive' } },
            { deviationReason: { contains: q.search, mode: 'insensitive' } },
            { mess: { name: { contains: q.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [total, records] = await Promise.all([
    prisma.wasteRecord.count({ where }),
    prisma.wasteRecord.findMany({
      where,
      orderBy: { [q.sortBy]: q.sortDir },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        mess: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, name: true } },
        updatedBy: { select: { id: true, name: true } },
      },
    }),
  ]);

  const body: PaginatedData<(typeof records)[number]> = {
    items: records,
    pagination: {
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
    },
  };

  return apiSuccess(body);
});

// POST /api/waste-records — the daily data-collection submission.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const ctx = await requireAuth(req);

  const body = await req.json().catch(() => null);
  const parsed = createWasteRecordSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('Invalid request', 422, parsed.error.flatten());
  }
  const input = parsed.data;

  // Data Collectors may omit messId (implied by their account); Admins must
  // supply one. Either way resolveMessScope enforces the Data Collector
  // can't submit for a mess that isn't theirs.
  const messId = resolveMessScope(ctx, input.messId ?? null);
  if (!messId) {
    throw new ApiHttpError('messId is required', 422);
  }

  const mess = await prisma.mess.findUnique({ where: { id: messId } });
  if (!mess) throw new ApiHttpError('Mess not found', 404);

  const date = toDateOnly(input.date);
  const dayOfWeek = dayOfWeekFromDate(date);
  const weekType = input.weekType ?? weekTypeFromDate(date);

  const duplicate = await prisma.wasteRecord.findUnique({
    where: { messId_date_mealSlot: { messId, date, mealSlot: input.mealSlot } },
  });
  if (duplicate) {
    throw new ApiHttpError(
      'A waste record already exists for this mess/date/meal slot — edit it instead',
      409
    );
  }

  // Link to the scheduled MenuSlot (if Admin has defined one) — used to
  // display the expected menu and back the deviation comparison; not an
  // error if none exists yet.
  const menuSlot = await prisma.menuSlot.findUnique({
    where: {
      messId_weekType_dayOfWeek_mealSlot: { messId, weekType, dayOfWeek, mealSlot: input.mealSlot },
    },
  });

  // Cache-first weather: reads WeatherDaily if already cached for this
  // mess/date, otherwise fetches live from Open-Meteo and caches it. Never
  // blocks record creation — a failed fetch just leaves these fields null.
  const { weather } = await getOrFetchWeather(mess, date);

  const derived = computeWasteDerivedFields({
    plateWasteKg: input.plateWasteKg,
    counterWasteKg: input.counterWasteKg,
    packagingWasteKg: input.packagingWasteKg,
    headcount: input.headcount,
    quantityPrepared: input.quantityPrepared,
  });

  if (input.scheduleDeviation && !input.deviationReason) {
    throw new ApiHttpError('deviationReason is required when scheduleDeviation is true', 422);
  }

  const record = await prisma.wasteRecord.create({
    data: {
      messId,
      date,
      mealSlot: input.mealSlot,
      weekType,
      dayOfWeek,
      menuSlotId: menuSlot?.id ?? null,

      plateWasteKg: input.plateWasteKg,
      counterWasteKg: input.counterWasteKg,
      packagingWasteKg: input.packagingWasteKg,
      totalWasteKg: derived.totalWasteKg,

      headcount: input.headcount,
      quantityPrepared: input.quantityPrepared,
      quantityUnit: input.quantityUnit,
      totalIngredientCost: input.totalIngredientCost,

      wastePerPerson: derived.wastePerPerson,
      wastePercent: derived.wastePercent,

      temperatureC: weather?.temperatureMeanC ?? null,
      rainfallMm: weather?.rainMm ?? null,
      eventType: input.eventType,

      scheduleDeviation: input.scheduleDeviation,
      deviationReason: input.scheduleDeviation ? input.deviationReason : null,
      deviationDescription: input.scheduleDeviation ? input.deviationDescription : null,

      tags: input.tags,
      notes: input.notes,

      createdById: ctx.userId,
    },
    include: {
      mess: { select: { id: true, name: true, code: true } },
      menuSlot: true,
      createdBy: { select: { id: true, name: true } },
    },
  });

  return apiSuccess({ record }, 201);
});
