// Test harness: boots the real app against an in-memory Postgres (PGlite) so the
// exact Prisma queries and the shipped SQL migration are exercised — no Docker needed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import pkg from '@prisma/client';
import { PrismaPGlite } from 'pglite-prisma-adapter';
import { io as connectClient } from 'socket.io-client';

process.env.NODE_ENV = 'test';
const { PrismaClient } = pkg;
const { loadConfig } = await import('../src/config.js');
const { createApp } = await import('../src/app.js');
const { seedGames } = await import('../src/seed.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '../prisma/migrations');

export async function startTestServer(overrides = {}) {
  const pg = new PGlite();
  const dirs = fs.readdirSync(migrationsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  for (const dir of dirs) await pg.exec(fs.readFileSync(path.join(migrationsDir, dir, 'migration.sql'), 'utf8'));

  const prisma = new PrismaClient({ adapter: new PrismaPGlite(pg) });
  await seedGames(prisma);

  const config = loadConfig({
    env: 'test',
    isTest: true,
    clientDist: '/nonexistent',
    matchGraceMs: 300,
    authRateLimit: 10_000,
    scoreRateLimit: 10_000,
    bcryptRounds: 4,
    adminKey: 'test-admin-key',
    ...overrides,
  });
  const app = createApp({ prisma, config });
  await new Promise((resolve) => app.httpServer.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${app.httpServer.address().port}`;

  const sockets = [];
  return {
    prisma,
    config,
    baseUrl,
    matches: app.sockets.matches,

    /** Tiny fetch wrapper → { status, body } */
    async api(route, { method = 'GET', token, body, headers = {} } = {}) {
      const res = await fetch(baseUrl + route, {
        method,
        headers: {
          ...(body ? { 'content-type': 'application/json' } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let parsed;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = text;
      }
      return { status: res.status, body: parsed };
    },

    async guest() {
      const res = await this.api('/api/auth/guest', { method: 'POST' });
      return res.body; // { token, user }
    },

    /** Connect an authenticated socket (resolves once connected). */
    connect(token) {
      return new Promise((resolve, reject) => {
        const s = connectClient(baseUrl, { auth: { token }, transports: ['websocket'], forceNew: true, reconnection: false });
        sockets.push(s);
        // The server may emit `match:resume` the instant the socket connects, before the
        // caller can attach a listener — capture it so tests can await it afterwards.
        s.resumed = new Promise((res) => s.once('match:resume', res));
        s.once('connect', () => resolve(s));
        s.once('connect_error', (err) => reject(err));
      });
    },

    async close() {
      sockets.forEach((s) => s.disconnect());
      await app.sockets.matches.idle();
      await app.close();
      await prisma.$disconnect();
      await pg.close();
    },
  };
}

/** Resolve with the next `event` payload (or reject after `ms`). */
export function once(socket, event, ms = 3000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out waiting for "${event}"`)), ms);
    socket.once(event, (payload) => {
      clearTimeout(t);
      resolve(payload);
    });
  });
}

export const emit = (socket, event, payload) =>
  new Promise((resolve) => socket.emit(event, payload, resolve));

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
