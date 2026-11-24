import { Router } from 'express';
import { z } from 'zod';
import { AppError, validate } from '../utils/errors.js';
import {
  gameLeaderboard,
  globalLeaderboard,
  userGameStanding,
  userStats,
} from '../services/leaderboard.js';

const limitQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) });

const submitSchema = z.object({
  game: z.string().min(1),
  score: z.number().int('must be a whole number').min(0, 'must be ≥ 0'),
  meta: z.record(z.string(), z.any()).optional(),
});

export function scoresRoutes({ prisma, auth }) {
  const router = Router();

  // Submit a score for a single-player game.
  router.post('/', auth.required, async (req, res) => {
    const body = validate(submitSchema, req.body);
    const game = await prisma.game.findUnique({ where: { slug: body.game } });
    if (!game) throw new AppError(404, 'Game not found', 'NOT_FOUND');
    if (game.multiplayer) {
      throw new AppError(403, 'Multiplayer results are recorded by the server', 'FORBIDDEN');
    }
    if (body.score > game.maxScore) {
      throw new AppError(422, 'That score is outside the allowed range for this game', 'SCORE_REJECTED');
    }
    if (body.meta && JSON.stringify(body.meta).length > 1000) {
      throw new AppError(413, 'meta is too large', 'TOO_LARGE');
    }

    const before = await userGameStanding(prisma, game, req.user.id);
    const row = await prisma.score.create({
      data: { userId: req.user.id, gameId: game.id, score: body.score, meta: body.meta ?? undefined },
    });
    const after = await userGameStanding(prisma, game, req.user.id);
    const isPersonalBest =
      game.scoring === 'best' ? !before || body.score > before.score : false;

    res.status(201).json({
      score: { id: row.id, score: row.score, createdAt: row.createdAt },
      isPersonalBest,
      standing: after,
    });
  });

  // Global leaderboard (sum of each player's per-game standing).
  router.get('/leaderboard', async (req, res) => {
    const { limit } = validate(limitQuery, req.query);
    res.json({ scope: 'global', scoring: 'points', entries: await globalLeaderboard(prisma, limit) });
  });

  // Leaderboard for one game.
  router.get('/game/:slug', auth.optional, async (req, res) => {
    const { limit } = validate(limitQuery, req.query);
    const game = await prisma.game.findUnique({ where: { slug: req.params.slug } });
    if (!game) throw new AppError(404, 'Game not found', 'NOT_FOUND');
    const entries = await gameLeaderboard(prisma, game, limit);
    const me = req.user ? await userGameStanding(prisma, game, req.user.id) : null;
    res.json({ scope: game.slug, scoring: game.scoring, entries, me });
  });

  // The signed-in player's stats (bests, rank, recent activity).
  router.get('/me', auth.required, async (req, res) => {
    res.json({ stats: await userStats(prisma, req.user) });
  });

  return router;
}
