import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiSuccess, withErrorHandling } from '@/lib/api-response';
import { isModelConfigured, isModelMess, predictDailyBatch, getLastModelError } from '@/lib/model-client';

// GET /api/predict/model-status
// Temporary diagnostics: shows how the model env vars look to the server and
// makes one live test call to the model service. Never returns the API key.
export const GET = withErrorHandling(async (_req: NextRequest) => {
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
    env: {
      MODEL_SERVICE_URL: JSON.stringify(process.env.MODEL_SERVICE_URL ?? null),
      MODEL_MESS_CODE: JSON.stringify(process.env.MODEL_MESS_CODE ?? null),
      MODEL_API_KEY_length: (process.env.MODEL_API_KEY ?? '').length,
    },
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
