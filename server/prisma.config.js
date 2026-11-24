// Prisma 7 CLI configuration (migrate / generate). The runtime client gets its
// connection through a driver adapter in src/db.js.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';

const here = path.dirname(fileURLToPath(import.meta.url));
for (const file of [path.resolve(here, '../.env'), path.resolve(here, '.env')]) {
  try {
    process.loadEnvFile(file); // never overrides variables already set
  } catch {
    /* file not present — fine */
  }
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // Placeholder lets `prisma generate` run in CI/Docker builds without a database.
    url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/gamehub',
  },
});
