import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiSuccess, withErrorHandling } from '@/lib/api-response';
import { requireAuth } from '@/lib/require-auth';
import { isModelConfigured, isModelMess, predictDailyBatch, getLastModelError } from '@/lib/model-client';

// GET /api/predict/model-status
// Authenticated diagnostics. Connection credentials remain server-side.
export const GET = withErrorHandling(async (req: NextRequest) => {
  await requireAuth(req);
  let messes: { code: string; name: string }[] = [];
  try {
    messes = await prisma.mess.findMany({
      select: { code: true, name: true },
      orderBy: { code: 'asc' },
    });
  } catch {
    // If DB read fails, continue with probe
  }

  const started = Date.now();
  const result = await predictDailyBatch([{ date: '2025-01-01', has_biryani: false, has_dosa: false }]);

  return apiSuccess({
    configured: isModelConfigured(),
    messes: messes.map((m) => ({ code: m.code, name: m.name, usesModel: isModelMess(m.code) })),
    probe: {
      ok: result !== null,
      ms: Date.now() - started,
      expected_kg: result?.[0]?.expected_kg ?? null,
      error: getLastModelError(),
    },
  });
});
