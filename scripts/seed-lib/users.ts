// One Admin (unscoped) + one Data Collector per mess. Passwords are fixed
// demo values printed at the end of the seed run — change them after first
// login in a real deployment.

export interface SeedUserSpec {
  email: string;
  password: string;
  name: string;
  role: 'ADMIN' | 'DATA_COLLECTOR';
  messCode: string | null; // null for Admin
}

export const DEFAULT_ADMIN_PASSWORD = 'Admin@12345';
export const DEFAULT_COLLECTOR_PASSWORD = 'Collector@12345';

export function buildSeedUsers(messCodes: string[]): SeedUserSpec[] {
  // Override the demo passwords with SEED_ADMIN_PASSWORD / SEED_COLLECTOR_PASSWORD
  // (e.g. when seeding a hosted database).
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
  const collectorPassword = process.env.SEED_COLLECTOR_PASSWORD || DEFAULT_COLLECTOR_PASSWORD;

  const users: SeedUserSpec[] = [
    {
      email: 'admin@messwaste.local',
      password: adminPassword,
      name: 'System Admin',
      role: 'ADMIN',
      messCode: null,
    },
  ];

  for (const code of messCodes) {
    users.push({
      email: `collector.${code.toLowerCase()}@messwaste.local`,
      password: collectorPassword,
      name: `${code} Data Collector`,
      role: 'DATA_COLLECTOR',
      messCode: code,
    });
  }

  return users;
}
