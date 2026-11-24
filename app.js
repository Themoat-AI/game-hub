import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import { Server } from 'socket.io';
import { createAuth } from './middleware/auth.js';
import { authRoutes } from './routes/auth.js';
import { gamesRoutes } from './routes/games.js';
import { scoresRoutes } from './routes/scores.js';
import { attachSockets } from './sockets/index.js';
import { errorHandler, notFound } from './utils/errors.js';

/** Builds the HTTP app + Socket.io server. Injectable `prisma`/`config` keep it testable. */
export function createApp({ prisma, config }) {
  const app = express();
  app.set('trust proxy', 1); // Render / Railway / Fly sit behind a proxy
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'", 'ws:', 'wss:', ...config.clientOrigins],
          frameSrc: ["'self'", 'https:'], // external games are embedded in iframes
          frameAncestors: ["'self'"],
          objectSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(cors({ origin: config.clientOrigins }));
  app.use(compression());
  app.use(express.json({ limit: '100kb' }));
  if (!config.isTest) app.use(morgan(config.isProd ? 'combined' : 'dev'));

  const auth = createAuth({ prisma, config });
  const ctx = { prisma, config, auth };

  const limiter = (windowMs, limit) =>
    rateLimit({
      windowMs,
      limit,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down' } },
    });

  app.get('/api/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ ok: true, db: 'up', uptime: Math.round(process.uptime()) });
    } catch {
      res.status(503).json({ ok: false, db: 'down' });
    }
  });

  app.use('/api/auth', limiter(15 * 60 * 1000, config.authRateLimit), authRoutes(ctx));
  app.use('/api/games', gamesRoutes(ctx));
  app.use('/api/scores', limiter(60 * 1000, config.scoreRateLimit), scoresRoutes(ctx));
  app.use('/api', notFound);

  // Serve the built React app (single-container deployments).
  const indexHtml = path.join(config.clientDist, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(config.clientDist, { index: false, maxAge: config.isProd ? '1h' : 0 }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/socket.io')) return next();
      res.sendFile(indexHtml); // SPA fallback for client-side routes
    });
  }

  app.use(errorHandler(config));

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, { cors: { origin: config.clientOrigins }, pingInterval: 10_000, pingTimeout: 8_000 });
  const sockets = attachSockets({ io, prisma, config });

  async function close() {
    sockets.stop();
    await new Promise((resolve) => io.close(resolve)); // also closes the HTTP server
  }

  return { app, httpServer, io, sockets, close };
}
