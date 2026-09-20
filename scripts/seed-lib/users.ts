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

export function buildSeedUsers(messCodes: string[]): SeedUserSpec[] {
  const users: SeedUserSpec[] = [
    {
      email: 'admin@messwaste.local',
      password: 'Admin@12345',
      name: 'System Admin',
      role: 'ADMIN',
      messCode: null,
    },
  ];

  for (const code of messCodes) {
    users.push({
      email: `collector.${code.toLowerCase()}@messwaste.local`,
      password: 'Collector@12345',
      name: `${code} Data Collector`,
      role: 'DATA_COLLECTOR',
      messCode: code,
    });
  }

  return users;
}
