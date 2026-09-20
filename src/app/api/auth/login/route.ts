import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword, signAuthToken, AUTH_COOKIE_NAME, AUTH_COOKIE_MAX_AGE_SECONDS } from '@/lib/auth';
import { apiSuccess, apiError, withErrorHandling, ApiHttpError } from '@/lib/api-response';
import { loginSchema } from '@/lib/validation/auth';

export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('Invalid request', 422, parsed.error.flatten());
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });

  // Same generic message whether the email doesn't exist or the password is
  // wrong — avoids leaking which emails are registered.
  if (!user || !user.isActive) {
    throw new ApiHttpError('Invalid email or password', 401);
  }

  const passwordOk = await verifyPassword(password, user.passwordHash);
  if (!passwordOk) {
    throw new ApiHttpError('Invalid email or password', 401);
  }

  const token = await signAuthToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    messId: user.messId,
  });

  const response = apiSuccess({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      messId: user.messId,
    },
  });

  response.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
  });

  return response;
});
