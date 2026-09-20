import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { Role } from '@prisma/client';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN_SECONDS = Number(process.env.JWT_EXPIRES_IN_SECONDS ?? 28800); // 8h default

if (!JWT_SECRET && process.env.NODE_ENV !== 'test') {
  // Fail loudly at boot rather than silently signing tokens with 'undefined'.
  // eslint-disable-next-line no-console
  console.warn('[auth] JWT_SECRET is not set — set it in your .env file.');
}

function getSecretKey(): Uint8Array {
  if (!JWT_SECRET) throw new Error('JWT_SECRET is not configured');
  return new TextEncoder().encode(JWT_SECRET);
}

export const AUTH_COOKIE_NAME = 'messwaste_token';

export interface AuthTokenPayload {
  sub: string; // user id
  email: string;
  role: Role;
  messId: string | null;
}

export async function hashPassword(plain: string): Promise<string> {
  const SALT_ROUNDS = 12;
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function signAuthToken(payload: AuthTokenPayload): Promise<string> {
  return new SignJWT({ email: payload.email, role: payload.role, messId: payload.messId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + JWT_EXPIRES_IN_SECONDS)
    .sign(getSecretKey());
}

export async function verifyAuthToken(token: string): Promise<AuthTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (!payload.sub || !payload.email || !payload.role) return null;
    return {
      sub: payload.sub as string,
      email: payload.email as string,
      role: payload.role as Role,
      messId: (payload.messId as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

export const AUTH_COOKIE_MAX_AGE_SECONDS = JWT_EXPIRES_IN_SECONDS;
