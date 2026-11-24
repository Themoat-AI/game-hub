import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { AppError, validate } from '../utils/errors.js';
import { signToken, privateUser } from '../middleware/auth.js';
import { userStats } from '../services/leaderboard.js';

const username = z
  .string()
  .trim()
  .min(3, 'must be at least 3 characters')
  .max(20, 'must be at most 20 characters')
  .regex(/^[A-Za-z0-9_-]+$/, 'may only contain letters, numbers, _ and -');

const registerSchema = z.object({
  username,
  email: z.string().trim().toLowerCase().email('must be a valid email').max(254).optional().or(z.literal('').transform(() => undefined)),
  password: z.string().min(8, 'must be at least 8 characters').max(72, 'must be at most 72 characters'),
});

const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'is required'),
  password: z.string().min(1, 'is required'),
});

// Compared against when the account doesn't exist, so response time doesn't reveal it.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export function authRoutes({ prisma, config, auth }) {
  const router = Router();

  const respond = (res, status, user) =>
    res.status(status).json({ token: signToken(config, user), user: privateUser(user) });

  // Create an account. If called with a guest's token, the guest is upgraded in place
  // so their scores and saves carry over.
  router.post('/register', auth.optional, async (req, res) => {
    const body = validate(registerSchema, req.body);

    const clash = await prisma.user.findFirst({
      where: {
        OR: [
          { username: { equals: body.username, mode: 'insensitive' } },
          ...(body.email ? [{ email: body.email }] : []),
        ],
        ...(req.user?.isGuest ? { NOT: { id: req.user.id } } : {}),
      },
    });
    if (clash) {
      const nameTaken = clash.username.toLowerCase() === body.username.toLowerCase();
      throw new AppError(409, nameTaken ? 'That username is taken' : 'That email is already registered', 'CONFLICT');
    }

    const passwordHash = await bcrypt.hash(body.password, config.bcryptRounds);
    const data = { username: body.username, email: body.email ?? null, passwordHash, isGuest: false };
    const user = req.user?.isGuest
      ? await prisma.user.update({ where: { id: req.user.id }, data })
      : await prisma.user.create({ data });
    respond(res, 201, user);
  });

  router.post('/login', async (req, res) => {
    const { identifier, password } = validate(loginSchema, req.body);
    const user = await prisma.user.findFirst({
      where: {
        isGuest: false,
        OR: [{ username: { equals: identifier, mode: 'insensitive' } }, { email: identifier.toLowerCase() }],
      },
    });
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw new AppError(401, 'Incorrect username or password', 'BAD_CREDENTIALS');
    respond(res, 200, user);
  });

  // Instant guest account — no password, can be upgraded later via /register.
  router.post('/guest', async (_req, res) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const name = `Guest-${randomBytes(3).toString('hex')}`;
      try {
        const user = await prisma.user.create({ data: { username: name, isGuest: true } });
        return respond(res, 201, user);
      } catch (err) {
        if (err?.code !== 'P2002') throw err; // username collision → retry
      }
    }
    throw new AppError(503, 'Could not create a guest account, try again', 'UNAVAILABLE');
  });

  // Token verification + profile (used by the client to restore sessions).
  const me = async (req, res) => {
    const stats = await userStats(prisma, req.user);
    res.json({ user: privateUser(req.user), stats });
  };
  router.get('/me', auth.required, me);
  router.get('/verify', auth.required, me);

  return router;
}
