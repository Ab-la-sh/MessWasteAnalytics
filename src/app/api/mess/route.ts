import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/require-auth';
import { apiSuccess, apiError, withErrorHandling, ApiHttpError } from '@/lib/api-response';
import { createMessSchema } from '@/lib/validation/mess';

// Any authenticated user can list messes (needed for the mess selector).
// Data Collectors still see every mess here — the selector shows them all
// but write actions elsewhere are scoped to their own via resolveMessScope.
export const GET = withErrorHandling(async (req: NextRequest) => {
  await requireAuth(req);

  const includeInactive = req.nextUrl.searchParams.get('includeInactive') === 'true';

  const messes = await prisma.mess.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: { name: 'asc' },
  });

  return apiSuccess({ messes });
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const ctx = await requireAuth(req);
  requireRole(ctx, 'ADMIN');

  const body = await req.json().catch(() => null);
  const parsed = createMessSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('Invalid request', 422, parsed.error.flatten());
  }

  const codeTaken = await prisma.mess.findUnique({ where: { code: parsed.data.code } });
  if (codeTaken) {
    throw new ApiHttpError('A mess with this code already exists', 409);
  }

  const mess = await prisma.mess.create({ data: parsed.data });
  return apiSuccess({ mess }, 201);
});
