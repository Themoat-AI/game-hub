import jwt from 'jsonwebtoken';
import { AppError } from '../utils/errors.js';

export const signToken = (config, user) =>
  jwt.sign({ sub: user.id, guest: user.isGuest }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });

export const verifyToken = (config, token) => jwt.verify(token, config.jwtSecret);

export const publicUser = (u) => ({
  id: u.id,
  username: u.username,
  isGuest: u.isGuest,
  gamesPlayed: u.gamesPlayed,
  createdAt: u.createdAt,
});

export const privateUser = (u) => ({ ...publicUser(u), email: u.email ?? null });

/** Builds `optional` / `required` Express middlewares that attach `req.user`. */
export function createAuth({ prisma, config }) {
  async function load(req) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    try {
      const payload = verifyToken(config, header.slice(7));
      return await prisma.user.findUnique({ where: { id: payload.sub } });
    } catch {
      return null; // expired / tampered token
    }
  }
  return {
    optional: async (req, _res, next) => {
      req.user = await load(req);
      next();
    },
    required: async (req, _res, next) => {
      const user = await load(req);
      if (!user) throw new AppError(401, 'Please sign in to continue', 'UNAUTHORIZED');
      req.user = user;
      next();
    },
  };
}
