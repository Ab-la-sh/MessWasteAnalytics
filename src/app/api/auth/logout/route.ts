import { NextRequest } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/lib/auth';
import { apiSuccess, withErrorHandling } from '@/lib/api-response';

export const POST = withErrorHandling(async (_req: NextRequest) => {
  const response = apiSuccess({ loggedOut: true });
  response.cookies.set(AUTH_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
});
