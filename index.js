import { randomUUID } from 'node:crypto';
import { engines } from '../games/index.js';
import { verifyToken } from '../middleware/auth.js';
import { MatchManager } from './matches.js';

const HISTORY_LIMIT = 50;
const MAX_CHAT_LEN = 300;
const CHAT_BURST = 5; // messages …
const CHAT_WINDOW_MS = 5000; // … per 5 seconds

const lobbyRoom = (room) => `lobby:${room}`;
const isLobby = (room) => room === 'global' || Boolean(engines[room]);

/**
 * Socket.io layer: JWT handshake auth, lobby chat + presence, matchmaking,
 * private rooms and synchronous 2-player matches (see matches.js).
 */
export function attachSockets({ io, prisma, config }) {
  const matches = new MatchManager({ io, prisma, graceMs: config.matchGraceMs });
  const history = new Map(); // room → last N messages (in memory; lobby chat is ephemeral)

  // Every socket must present a valid JWT (registered users and guests alike).
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('AUTH_REQUIRED'));
      const payload = verifyToken(config, token);
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) return next(new Error('AUTH_INVALID'));
      socket.data.user = { id: user.id, username: user.username, isGuest: user.isGuest };
      socket.data.chatTimes = [];
      next();
    } catch {
      next(new Error('AUTH_INVALID'));
    }
  });

  async function presence(room) {
    const sockets = await io.in(lobbyRoom(room)).fetchSockets();
    const seen = new Map();
    for (const s of sockets) seen.set(s.data.user.id, { username: s.data.user.username, isGuest: s.data.user.isGuest });
    io.to(lobbyRoom(room)).emit('lobby:presence', { room, users: [...seen.values()] });
  }

  io.on('connection', (socket) => {
    const user = socket.data.user;
    const ack = (cb, payload) => typeof cb === 'function' && cb(payload);

    matches.onConnect(socket); // resume an in-progress match after a refresh/reconnect

    // ── lobby chat ──────────────────────────────────────────────────────────
    socket.on('lobby:join', async (payload, cb) => {
      const room = payload?.room;
      if (!isLobby(room)) return ack(cb, { ok: false, error: 'Unknown lobby' });
      socket.join(lobbyRoom(room));
      ack(cb, { ok: true, history: history.get(room) ?? [] });
      presence(room);
    });

    socket.on('lobby:leave', (payload, cb) => {
      const room = payload?.room;
      if (!isLobby(room)) return ack(cb, { ok: false, error: 'Unknown lobby' });
      socket.leave(lobbyRoom(room));
      ack(cb, { ok: true });
      presence(room);
    });

    // Chat goes to a lobby you've joined, or to your current match room.
    socket.on('chat:send', (payload, cb) => {
      const room = String(payload?.room ?? '');
      const text = String(payload?.text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHAT_LEN);
      if (!text) return ack(cb, { ok: false, error: 'Message is empty' });

      const isMatchRoom = room.startsWith('match:');
      const target = isMatchRoom ? room : lobbyRoom(room);
      if (!socket.rooms.has(target)) return ack(cb, { ok: false, error: 'Join the room first' });

      const now = Date.now();
      socket.data.chatTimes = socket.data.chatTimes.filter((t) => now - t < CHAT_WINDOW_MS);
      if (socket.data.chatTimes.length >= CHAT_BURST) return ack(cb, { ok: false, error: 'Slow down a little' });
      socket.data.chatTimes.push(now);

      const message = { id: randomUUID(), room, userId: user.id, username: user.username, isGuest: user.isGuest, text, ts: now };
      if (!isMatchRoom) {
        const list = history.get(room) ?? [];
        list.push(message);
        if (list.length > HISTORY_LIMIT) list.shift();
        history.set(room, list);
      }
      io.to(target).emit('chat:message', message);
      ack(cb, { ok: true });
    });

    socket.on('disconnecting', () => {
      const lobbies = [...socket.rooms].filter((r) => r.startsWith('lobby:')).map((r) => r.slice(6));
      // Presence is recomputed after the socket has actually left its rooms.
      setImmediate(() => lobbies.forEach((room) => presence(room)));
    });

    // ── matchmaking & rooms ─────────────────────────────────────────────────
    socket.on('queue:join', (payload, cb) => ack(cb, matches.enqueue(socket, payload?.game)));
    socket.on('queue:leave', (_payload, cb) => ack(cb, { ok: true, wasQueued: matches.dequeue(socket) }));
    socket.on('room:create', (payload, cb) => ack(cb, matches.createRoom(socket, payload?.game)));
    socket.on('room:join', (payload, cb) => ack(cb, matches.joinRoom(socket, payload?.code)));
    socket.on('room:cancel', (_payload, cb) => {
      matches.dropRoom(socket);
      ack(cb, { ok: true });
    });

    // ── in-match ────────────────────────────────────────────────────────────
    socket.on('match:sync', (payload, cb) => ack(cb, matches.sync(socket, payload?.matchId)));
    socket.on('match:action', (payload, cb) => ack(cb, matches.action(socket, payload?.matchId, payload?.action)));
    socket.on('match:rematch', (payload, cb) => ack(cb, matches.rematch(socket, payload?.matchId)));
    socket.on('match:leave', (payload, cb) => ack(cb, matches.leave(socket, payload?.matchId)));

    socket.on('disconnect', () => matches.onDisconnect(socket));
  });

  return { matches, stop: () => matches.stop() };
}
