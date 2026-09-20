import type { Prisma } from '@prisma/client';

// The only shape a user ever leaves the API in — passwordHash is never selected.
// Lives here (not in a route file) because Next.js route modules may only
// export HTTP handlers and route-config fields.
export const USER_PUBLIC_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  messId: true,
  mess: { select: { id: true, name: true, code: true } },
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;
