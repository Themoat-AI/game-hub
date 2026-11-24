import { Router } from 'express';
import { z } from 'zod';
import { AppError, validate } from '../utils/errors.js';

const listQuery = z.object({
  search: z.string().trim().max(60).optional(),
  category: z.string().trim().max(30).optional(),
  multiplayer: z.enum(['true', 'false']).optional(),
  sort: z.enum(['popular', 'newest', 'title', 'default']).default('default'),
});

const createSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,40}$/, 'lowercase letters, numbers and dashes only'),
  title: z.string().trim().min(1).max(60),
  description: z.string().trim().min(1).max(500),
  category: z.string().trim().min(1).max(30),
  // Only same-origin paths or https URLs may be embedded.
  url: z.string().refine((u) => u.startsWith('/') || u.startsWith('https://'), 'must be a /path or https:// URL'),
  featured: z.boolean().default(false),
  tags: z.array(z.string().max(20)).max(10).default([]),
  maxScore: z.number().int().positive().max(1_000_000_000).default(100_000),
  assets: z.record(z.string(), z.any()).default({}),
});

const saveSchema = z.object({ data: z.record(z.string(), z.any()) });
const MAX_SAVE_BYTES = 64 * 1024;

export function gamesRoutes({ prisma, config, auth }) {
  const router = Router();

  const getGame = async (slug) => {
    const game = await prisma.game.findUnique({ where: { slug } });
    if (!game) throw new AppError(404, 'Game not found', 'NOT_FOUND');
    return game;
  };

  router.get('/', async (req, res) => {
    const q = validate(listQuery, req.query);
    const where = {};
    if (q.search) {
      where.OR = [
        { title: { contains: q.search, mode: 'insensitive' } },
        { description: { contains: q.search, mode: 'insensitive' } },
        { tags: { has: q.search.toLowerCase() } },
      ];
    }
    if (q.category) where.category = { equals: q.category, mode: 'insensitive' };
    if (q.multiplayer) where.multiplayer = q.multiplayer === 'true';

    const orderBy =
      q.sort === 'popular' ? { plays: 'desc' } : q.sort === 'newest' ? { createdAt: 'desc' } : q.sort === 'title' ? { title: 'asc' } : { sortOrder: 'asc' };
    const games = await prisma.game.findMany({ where, orderBy });
    res.json({ games });
  });

  router.get('/featured', async (_req, res) => {
    const games = await prisma.game.findMany({ where: { featured: true }, orderBy: { sortOrder: 'asc' } });
    res.json({ games });
  });

  router.get('/categories', async (_req, res) => {
    const [groups, multiplayer] = await Promise.all([
      prisma.game.groupBy({ by: ['category'], _count: true, orderBy: { category: 'asc' } }),
      prisma.game.count({ where: { multiplayer: true } }),
    ]);
    res.json({
      categories: groups.map((g) => ({ name: g.category, count: g._count })),
      multiplayer,
    });
  });

  // Admin: register an external HTML5 game that will be embedded in an iframe.
  router.post('/', async (req, res) => {
    const key = req.get('x-admin-key');
    if (!config.adminKey || key !== config.adminKey) throw new AppError(403, 'Admin key required', 'FORBIDDEN');
    const body = validate(createSchema, req.body);
    const count = await prisma.game.count();
    const game = await prisma.game.create({
      data: { ...body, type: 'external', multiplayer: false, scoring: 'best', sortOrder: 100 + count },
    });
    res.status(201).json({ game });
  });

  router.get('/:slug', async (req, res) => {
    res.json({ game: await getGame(req.params.slug) });
  });

  // Record that the signed-in user started a session (feeds "games played" + popularity).
  router.post('/:slug/play', auth.required, async (req, res) => {
    const game = await getGame(req.params.slug);
    if (game.multiplayer) return res.json({ ok: true, counted: false }); // server counts finished matches
    await prisma.$transaction([
      prisma.game.update({ where: { id: game.id }, data: { plays: { increment: 1 } } }),
      prisma.user.update({ where: { id: req.user.id }, data: { gamesPlayed: { increment: 1 } } }),
    ]);
    res.json({ ok: true, counted: true });
  });

  router.get('/:slug/save', auth.required, async (req, res) => {
    const game = await getGame(req.params.slug);
    const save = await prisma.gameSave.findUnique({ where: { userId_gameId: { userId: req.user.id, gameId: game.id } } });
    res.json({ save: save ? { data: save.data, updatedAt: save.updatedAt } : null });
  });

  router.put('/:slug/save', auth.required, async (req, res) => {
    const game = await getGame(req.params.slug);
    const { data } = validate(saveSchema, req.body);
    if (Buffer.byteLength(JSON.stringify(data)) > MAX_SAVE_BYTES) {
      throw new AppError(413, 'Save data is too large (64 KB max)', 'TOO_LARGE');
    }
    const where = { userId_gameId: { userId: req.user.id, gameId: game.id } };
    const save = await prisma.gameSave.upsert({
      where,
      create: { userId: req.user.id, gameId: game.id, data },
      update: { data },
    });
    res.json({ save: { data: save.data, updatedAt: save.updatedAt } });
  });

  return router;
}
