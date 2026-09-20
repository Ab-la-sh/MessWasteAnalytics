import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireRole, resolveMessScope } from '@/lib/require-auth';
import { apiError, withErrorHandling } from '@/lib/api-response';
import { exportQuerySchema } from '@/lib/validation/export';
import { searchParamsToObject } from '@/lib/query';
import { toDateOnly } from '@/lib/date-utils';
import { buildCsv, buildXlsx, exportFilename, type ExportableWasteRecord } from '@/lib/export';

// GET /api/export/waste-records?format=csv|xlsx&messId=&dateFrom=&dateTo=&mealSlot=&...
// Admin-only, per the spec ("Admin CSV/Excel export"). Reuses the exact same
// filter shape as GET /api/waste-records (minus pagination — export always
// returns the whole filtered set) so "export what I'm currently viewing on
// the Records page" is a straightforward query-string carry-over on the
// frontend.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const ctx = await requireAuth(req);
  requireRole(ctx, 'ADMIN');

  const parsed = exportQuerySchema.safeParse(searchParamsToObject(req));
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

  const MAX_EXPORT_ROWS = 50000; // sanity cap — this dataset is nowhere near this size

  const records: ExportableWasteRecord[] = await prisma.wasteRecord.findMany({
    where,
    orderBy: [{ date: 'asc' }, { mealSlot: 'asc' }],
    take: MAX_EXPORT_ROWS,
    include: {
      mess: { select: { name: true, code: true } },
      menuSlot: true,
    },
  });

  const filename = exportFilename(q.format);

  if (q.format === 'xlsx') {
    const xlsxBlob = await buildXlsx(records);
    return new NextResponse(xlsxBlob, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  const csv = buildCsv(records);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
});
