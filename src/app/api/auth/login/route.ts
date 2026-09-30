import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword, signAuthToken, AUTH_COOKIE_NAME, AUTH_COOKIE_MAX_AGE_SECONDS } from '@/lib/auth';
import { apiSuccess, apiError, withErrorHandling, ApiHttpError } from '@/lib/api-response';
import { loginSchema } from '@/lib/validation/auth';
import { hit, clientIp } from '@/lib/rate-limit';

// 10 attempts per IP and 5 per IP+email, per 15 minutes.
const WINDOW_MS = 15 * 60 * 1000;

export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('Invalid request', 422, parsed.error.flatten());
  }
  const { email, password } = parsed.data;

  const ip = clientIp(req);
  const byIp = hit(`login:ip:${ip}`, 10, WINDOW_MS);
  const byIpEmail = hit(`login:ip-email:${ip}:${email.toLowerCase()}`, 5, WINDOW_MS);
  if (!byIp.allowed || !byIpEmail.allowed) {
    const retryAfter = Math.max(byIp.retryAfterSeconds, byIpEmail.retryAfterSeconds);
    const res = apiError('Too many login attempts. Please try again later.', 429);
    res.headers.set('Retry-After', String(retryAfter));
    return res;
  }

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
