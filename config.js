import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// Load .env from the repo root or server/ (Node ≥ 20.12). Existing env vars win.
for (const file of [path.resolve(here, '../../.env'), path.resolve(here, '../.env')]) {
  try {
    process.loadEnvFile(file);
  } catch {
    /* no .env file — rely on real environment variables */
  }
}

export function loadConfig(overrides = {}) {
  const env = process.env;
  const nodeEnv = env.NODE_ENV || 'development';
  const isProd = nodeEnv === 'production';

  const config = {
    env: nodeEnv,
    isProd,
    isTest: nodeEnv === 'test',
    port: Number(env.PORT) || 4000,
    databaseUrl: env.DATABASE_URL,
    jwtSecret: env.JWT_SECRET || (isProd ? '' : 'dev-only-insecure-secret-change-me'),
    jwtExpiresIn: env.JWT_EXPIRES_IN || '7d',
    // Comma-separated list of browser origins allowed to call the API (only needed
    // when the client is hosted on a different origin, e.g. Vercel + Render).
    clientOrigins: (env.CLIENT_ORIGIN || 'http://localhost:5173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    // Built React app. When it exists the server serves it (single-container deploy).
    clientDist: env.CLIENT_DIST || path.resolve(here, '../../client/dist'),
    // Optional secret enabling POST /api/games (register external games).
    adminKey: env.ADMIN_KEY || '',
    autoSeed: env.AUTO_SEED !== 'false',
    authRateLimit: Number(env.AUTH_RATE_LIMIT) || 60, // requests / 15 min / IP
    scoreRateLimit: Number(env.SCORE_RATE_LIMIT) || 60, // requests / min / IP
    bcryptRounds: Number(env.BCRYPT_ROUNDS) || 10,
    matchGraceMs: Number(env.MATCH_GRACE_MS) || 10_000,
    ...overrides,
  };

  if (!config.jwtSecret) {
    throw new Error('JWT_SECRET must be set when NODE_ENV=production');
  }
  if (isProd && config.jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in production');
  }
  return config;
}
