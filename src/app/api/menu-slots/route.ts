import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireRole, resolveMessScope } from '@/lib/require-auth';
import { apiSuccess, apiError, withErrorHandling, ApiHttpError } from '@/lib/api-response';
import { createMenuSlotSchema, menuSlotQuerySchema } from '@/lib/validation/menu-slot';
import { searchParamsToObject } from '@/lib/query';

// Any authenticated user can read the schedule (Data Collectors need it to
// see what's expected for today's meal). Data Collectors are always
// constrained to their own mess regardless of the messId query param.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const ctx = await requireAuth(req);

  const parsed = menuSlotQuerySchema.safeParse(searchParamsToObject(req));
  if (!parsed.success) {
    return apiError('Invalid query parameters', 422, parsed.error.flatten());
  }
  const query = parsed.data;

  const messId = resolveMessScope(ctx, query.messId ?? null);

  const menuSlots = await prisma.menuSlot.findMany({
    where: {
      ...(messId ? { messId } : {}),
      ...(query.weekType ? { weekType: query.weekType } : {}),
      ...(query.dayOfWeek ? { dayOfWeek: query.dayOfWeek } : {}),
      ...(query.mealSlot ? { mealSlot: query.mealSlot } : {}),
    },
    include: { mess: { select: { id: true, name: true, code: true } } },
    orderBy: [{ messId: 'asc' }, { weekType: 'asc' }, { dayOfWeek: 'asc' }, { mealSlot: 'asc' }],
  });

  return apiSuccess({ menuSlots });
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const ctx = await requireAuth(req);
  requireRole(ctx, 'ADMIN');

  const body = await req.json().catch(() => null);
  const parsed = createMenuSlotSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('Invalid request', 422, parsed.error.flatten());
  }
  const data = parsed.data;

  const mess = await prisma.mess.findUnique({ where: { id: data.messId } });
  if (!mess) throw new ApiHttpError('Mess not found', 404);

  const existing = await prisma.menuSlot.findUnique({
    where: {
      messId_weekType_dayOfWeek_mealSlot: {
        messId: data.messId,
        weekType: data.weekType,
        dayOfWeek: data.dayOfWeek,
        mealSlot: data.mealSlot,
      },
    },
  });
  if (existing) {
    throw new ApiHttpError(
      'A menu slot already exists for this mess/week type/day/meal — edit it instead',
      409
    );
  }

  const menuSlot = await prisma.menuSlot.create({ data });
  return apiSuccess({ menuSlot }, 201);
});
