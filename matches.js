import { randomInt, randomUUID } from 'node:crypto';
import { engines } from '../games/index.js';

const ROOM_TTL_MS = 10 * 60 * 1000; // private room codes expire
const OVER_TTL_MS = 5 * 60 * 1000; // finished matches stay around for rematches
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

/**
 * Owns every live 2-player match: matchmaking queues, private rooms, the 60 Hz
 * simulation loop, reconnect grace periods, rematches and result persistence.
 *
 * Socket → client events:
 *   queue:waiting, match:found, match:resume, match:state, match:over,
 *   match:opponent {status: disconnected|reconnected|left}, match:rematch
 */
export class MatchManager {
  constructor({ io, prisma, graceMs = 10_000, tickHz = 60, log = console }) {
    this.io = io;
    this.prisma = prisma;
    this.graceMs = graceMs;
    this.log = log;
    this.matches = new Map(); // matchId → match
    this.byUser = new Map(); // userId → matchId (active matches only)
    this.queues = new Map(); // game → [{socketId}]
    this.rooms = new Map(); // code → {game, socketId, userId, expires}
    this.pending = new Set(); // in-flight DB writes (awaitable via idle())
    this.ticks = 0;
    this.last = performance.now();
    this.timer = setInterval(() => this.tick(), 1000 / tickHz);
    this.timer.unref();
  }

  stop() {
    clearInterval(this.timer);
    for (const m of this.matches.values()) {
      clearTimeout(m.expireTimer);
      m.players.forEach((p) => clearTimeout(p.timer));
    }
  }

  /** Resolves once all result writes have finished (used by tests / graceful shutdown). */
  async idle() {
    await Promise.allSettled([...this.pending]);
  }

  // ── helpers ────────────────────────────────────────────────────────────────
  sock(id) {
    return this.io.sockets.sockets.get(id);
  }
  room(match) {
    return `match:${match.id}`;
  }
  matchOfUser(userId) {
    const id = this.byUser.get(userId);
    return id ? this.matches.get(id) : undefined;
  }
  indexOf(match, userId) {
    return match.players.findIndex((p) => p.userId === userId);
  }
  info(match, you) {
    return {
      matchId: match.id,
      game: match.game,
      you,
      players: match.players.map((p) => ({ username: p.username, connected: p.connected })),
      config: match.engine.config ?? null,
    };
  }
  broadcast(match, volatile = false) {
    const target = volatile ? this.io.to(this.room(match)).volatile : this.io.to(this.room(match));
    target.emit('match:state', { matchId: match.id, state: match.engine.snapshot(match.state) });
  }

  // ── connection lifecycle ───────────────────────────────────────────────────
  onConnect(socket) {
    const match = this.matchOfUser(socket.data.user.id);
    if (!match) return;
    const idx = this.indexOf(match, socket.data.user.id);
    this.attach(socket, match, idx);
    socket.emit('match:resume', this.info(match, idx));
  }

  onDisconnect(socket) {
    this.dequeue(socket);
    this.dropRoom(socket);
    const match = this.matchOfUser(socket.data.user.id);
    if (!match) return;
    const idx = this.indexOf(match, socket.data.user.id);
    const player = match.players[idx];
    if (player.socketId !== socket.id) return; // another tab of the same user is active
    player.connected = false;
    this.io.to(this.room(match)).emit('match:opponent', { matchId: match.id, player: idx, status: 'disconnected', graceMs: this.graceMs });
    clearTimeout(player.timer);
    player.timer = setTimeout(() => {
      if (!player.connected && match.status === 'playing') this.forfeit(match, idx, 'disconnect');
    }, this.graceMs);
    player.timer.unref();
  }

  attach(socket, match, idx) {
    const player = match.players[idx];
    const wasAway = !player.connected;
    player.socketId = socket.id;
    player.connected = true;
    clearTimeout(player.timer);
    player.timer = null;
    socket.join(this.room(match));
    if (wasAway) socket.to(this.room(match)).emit('match:opponent', { matchId: match.id, player: idx, status: 'reconnected' });
  }

  // ── matchmaking ────────────────────────────────────────────────────────────
  enqueue(socket, game) {
    if (!engines[game]) return { ok: false, error: 'Unknown multiplayer game' };
    const user = socket.data.user;
    const existing = this.matchOfUser(user.id);
    if (existing) {
      this.attach(socket, existing, this.indexOf(existing, user.id));
      socket.emit('match:resume', this.info(existing, this.indexOf(existing, user.id)));
      return { ok: false, code: 'IN_MATCH', error: 'You are already in a match', matchId: existing.id };
    }
    this.dequeue(socket);
    this.dropRoom(socket);
    const queue = this.queues.get(game) ?? [];
    this.queues.set(game, queue);
    while (queue.length) {
      const waiting = this.sock(queue.shift().socketId);
      if (!waiting || waiting.data.queuedFor !== game || waiting.data.user.id === user.id) continue;
      this.createMatch(game, [waiting, socket]);
      return { ok: true, status: 'matched' };
    }
    queue.push({ socketId: socket.id });
    socket.data.queuedFor = game;
    socket.emit('queue:waiting', { game });
    return { ok: true, status: 'waiting' };
  }

  dequeue(socket) {
    const game = socket.data.queuedFor;
    if (!game) return false;
    const queue = this.queues.get(game) ?? [];
    this.queues.set(game, queue.filter((q) => q.socketId !== socket.id));
    socket.data.queuedFor = null;
    return true;
  }

  createRoom(socket, game) {
    if (!engines[game]) return { ok: false, error: 'Unknown multiplayer game' };
    if (this.matchOfUser(socket.data.user.id)) return { ok: false, error: 'You are already in a match' };
    this.dequeue(socket);
    this.dropRoom(socket);
    let code;
    do {
      code = Array.from({ length: 5 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
    } while (this.rooms.has(code));
    this.rooms.set(code, { game, socketId: socket.id, userId: socket.data.user.id, expires: Date.now() + ROOM_TTL_MS });
    socket.data.hostedRoom = code;
    return { ok: true, code, game };
  }

  joinRoom(socket, rawCode) {
    const code = String(rawCode ?? '').trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room || room.expires < Date.now()) return { ok: false, error: 'Room code not found or expired' };
    const host = this.sock(room.socketId);
    if (!host) {
      this.rooms.delete(code);
      return { ok: false, error: 'The host left the room' };
    }
    if (room.userId === socket.data.user.id) return { ok: false, error: "You can't join your own room" };
    if (this.matchOfUser(socket.data.user.id) || this.matchOfUser(room.userId)) {
      return { ok: false, error: 'A player is already in a match' };
    }
    this.rooms.delete(code);
    host.data.hostedRoom = null;
    this.dequeue(socket);
    this.createMatch(room.game, [host, socket]);
    return { ok: true, game: room.game };
  }

  dropRoom(socket) {
    const code = socket.data.hostedRoom;
    if (code) this.rooms.delete(code);
    socket.data.hostedRoom = null;
  }

  // ── match lifecycle ────────────────────────────────────────────────────────
  createMatch(game, sockets) {
    const engine = engines[game];
    const order = randomInt(2) === 0 ? sockets : [sockets[1], sockets[0]];
    const match = {
      id: randomUUID().slice(0, 8),
      game,
      engine,
      state: engine.create(),
      status: 'playing',
      result: null,
      overPayload: null,
      expireTimer: null,
      players: order.map((s) => ({
        userId: s.data.user.id,
        username: s.data.user.username,
        socketId: s.id,
        connected: true,
        synced: false, // simulation waits until both clients have loaded the game
        rematch: false,
        left: false,
        timer: null,
      })),
    };
    this.matches.set(match.id, match);
    match.players.forEach((p, i) => {
      this.byUser.set(p.userId, match.id);
      const s = this.sock(p.socketId);
      s.data.queuedFor = null;
      this.dropRoom(s);
      s.join(this.room(match));
      s.emit('match:found', this.info(match, i));
    });
    return match;
  }

  /** A client's game screen is ready: send it the full current state. */
  sync(socket, matchId) {
    const match = this.matches.get(matchId);
    const idx = match ? this.indexOf(match, socket.data.user.id) : -1;
    if (idx < 0) return { ok: false, error: 'Match not found' };
    this.attach(socket, match, idx);
    match.players[idx].synced = true;
    return {
      ok: true,
      ...this.info(match, idx),
      state: match.engine.snapshot(match.state),
      over: match.status === 'over' ? match.overPayload : null,
    };
  }

  action(socket, matchId, action) {
    const match = this.matches.get(matchId);
    const idx = match ? this.indexOf(match, socket.data.user.id) : -1;
    if (idx < 0) return { ok: false, error: 'Match not found' };
    if (match.status !== 'playing') return { ok: false, error: 'The match is over' };
    const out = match.engine.onAction(match.state, idx, action ?? {});
    if (out?.error) return { ok: false, error: out.error };
    if (!match.engine.tick) this.broadcast(match); // turn-based: push immediately
    this.checkResult(match);
    return { ok: true };
  }

  leave(socket, matchId) {
    const match = this.matches.get(matchId);
    const idx = match ? this.indexOf(match, socket.data.user.id) : -1;
    if (idx < 0) return { ok: false, error: 'Match not found' };
    if (match.status === 'playing') {
      this.forfeit(match, idx, 'forfeit');
    }
    match.players[idx].left = true;
    socket.leave(this.room(match));
    socket.to(this.room(match)).emit('match:opponent', { matchId: match.id, player: idx, status: 'left' });
    if (match.players.every((p) => p.left)) {
      clearTimeout(match.expireTimer);
      this.matches.delete(match.id);
    }
    return { ok: true };
  }

  rematch(socket, matchId) {
    const match = this.matches.get(matchId);
    const idx = match ? this.indexOf(match, socket.data.user.id) : -1;
    if (idx < 0 || match.status !== 'over') return { ok: false, error: 'Nothing to rematch' };
    if (match.players.some((p) => p.left)) return { ok: false, error: 'Your opponent left' };
    match.players[idx].rematch = true;
    socket.to(this.room(match)).emit('match:rematch', { matchId, from: match.players[idx].username });
    if (match.players.every((p) => p.rematch)) {
      const socks = match.players.map((p) => this.sock(p.socketId));
      const free = socks.every((s) => s && !this.matchOfUser(s.data.user.id));
      if (!free) return { ok: false, error: 'Your opponent is no longer available' };
      clearTimeout(match.expireTimer);
      this.matches.delete(match.id);
      for (const s of socks) s.leave(this.room(match));
      this.createMatch(match.game, socks.reverse());
    }
    return { ok: true };
  }

  checkResult(match) {
    const result = match.engine.result(match.state);
    if (!result) return false;
    this.finish(match, { ...result, reason: 'normal' });
    return true;
  }

  forfeit(match, loserIdx, reason) {
    this.finish(match, { winner: 1 - loserIdx, scores: match.state.scores ? [...match.state.scores] : [0, 0], reason });
  }

  finish(match, result) {
    if (match.status === 'over') return;
    match.status = 'over';
    match.result = result;
    for (const p of match.players) {
      clearTimeout(p.timer);
      p.timer = null;
      if (this.byUser.get(p.userId) === match.id) this.byUser.delete(p.userId);
    }
    const rewards = match.engine.rewards(result);
    match.overPayload = {
      matchId: match.id,
      winner: result.winner,
      reason: result.reason,
      scores: result.scores,
      rewards,
      players: match.players.map((p) => p.username),
    };
    this.broadcast(match);
    this.io.to(this.room(match)).emit('match:over', match.overPayload);
    match.expireTimer = setTimeout(() => this.matches.delete(match.id), OVER_TTL_MS);
    match.expireTimer.unref();

    const job = this.persist(match, rewards).catch((err) => this.log.error('[match] failed to persist result', err));
    this.pending.add(job);
    job.finally(() => this.pending.delete(job));
  }

  /** Writes plays + hub points. Players earn points per the engine's rewards(). */
  async persist(match, rewards) {
    const game = await this.prisma.game.findUnique({ where: { slug: match.game } });
    if (!game) return;
    const ops = [this.prisma.game.update({ where: { id: game.id }, data: { plays: { increment: 1 } } })];
    match.players.forEach((p, i) => {
      ops.push(this.prisma.user.update({ where: { id: p.userId }, data: { gamesPlayed: { increment: 1 } } }));
      if (rewards[i] > 0) {
        const outcome = match.result.winner === null ? 'draw' : match.result.winner === i ? 'win' : 'loss';
        ops.push(
          this.prisma.score.create({
            data: { userId: p.userId, gameId: game.id, score: rewards[i], meta: { matchId: match.id, outcome, reason: match.result.reason } },
          }),
        );
      }
    });
    await this.prisma.$transaction(ops);
  }

  // ── simulation loop ────────────────────────────────────────────────────────
  tick() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.ticks++;

    for (const match of this.matches.values()) {
      if (match.status !== 'playing' || !match.engine.tick) continue;
      // Pause the simulation while a player is away or hasn't loaded yet.
      if (match.players.some((p) => !p.connected || !p.synced)) continue;
      match.engine.tick(match.state, dt);
      if (this.checkResult(match)) continue;
      if (this.ticks % 2 === 0) this.broadcast(match, true); // 30 Hz updates
    }
    if (this.ticks % 600 === 0) this.sweepRooms();
  }

  sweepRooms() {
    const now = Date.now();
    for (const [code, room] of this.rooms) if (room.expires < now) this.rooms.delete(code);
  }
}
