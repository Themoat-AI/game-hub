import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { startTestServer } from './helpers.js';

let t;
before(async () => {
  t = await startTestServer();
});
after(() => t.close());

const register = (username, extra = {}) =>
  t.api('/api/auth/register', { method: 'POST', body: { username, password: 'correct-horse', ...extra } });

describe('auth', () => {
  test('health check reports the database', async () => {
    const res = await t.api('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.db, 'up');
  });

  test('register → verify → login', async () => {
    const reg = await register('Alice', { email: 'Alice@Example.com' });
    assert.equal(reg.status, 201);
    assert.ok(reg.body.token);
    assert.equal(reg.body.user.email, 'alice@example.com');
    assert.equal(reg.body.user.passwordHash, undefined, 'hash is never returned');

    const me = await t.api('/api/auth/me', { token: reg.body.token });
    assert.equal(me.status, 200);
    assert.equal(me.body.user.username, 'Alice');
    assert.equal(me.body.stats.gamesPlayed, 0);

    const verify = await t.api('/api/auth/verify', { token: reg.body.token });
    assert.equal(verify.status, 200);

    const byName = await t.api('/api/auth/login', { method: 'POST', body: { identifier: 'alice', password: 'correct-horse' } });
    assert.equal(byName.status, 200);
    const byEmail = await t.api('/api/auth/login', { method: 'POST', body: { identifier: 'alice@example.com', password: 'correct-horse' } });
    assert.equal(byEmail.status, 200);
  });

  test('rejects duplicates, weak input and bad credentials', async () => {
    assert.equal((await register('alice')).status, 409, 'case-insensitive username clash');
    assert.equal((await register('Bob', { email: 'alice@example.com' })).status, 409, 'email clash');
    assert.equal((await register('x')).status, 400);
    assert.equal((await register('bad name!')).status, 400);
    assert.equal((await t.api('/api/auth/register', { method: 'POST', body: { username: 'Carol', password: 'short' } })).status, 400);
    assert.equal((await t.api('/api/auth/login', { method: 'POST', body: { identifier: 'alice', password: 'wrong-password' } })).status, 401);
    assert.equal((await t.api('/api/auth/login', { method: 'POST', body: { identifier: 'nobody', password: 'whatever1' } })).status, 401);
  });

  test('protected routes need a valid token', async () => {
    assert.equal((await t.api('/api/auth/me')).status, 401);
    assert.equal((await t.api('/api/auth/me', { token: 'garbage' })).status, 401);
  });

  test('guest mode, then upgrade keeps the same account', async () => {
    const g = await t.guest();
    assert.match(g.user.username, /^Guest-/);
    assert.equal(g.user.isGuest, true);

    const asGuestLogin = await t.api('/api/auth/login', { method: 'POST', body: { identifier: g.user.username, password: 'whatever1' } });
    assert.equal(asGuestLogin.status, 401, 'guests cannot log in with a password');

    const up = await t.api('/api/auth/register', { method: 'POST', token: g.token, body: { username: 'Dana', password: 'correct-horse' } });
    assert.equal(up.status, 201);
    assert.equal(up.body.user.id, g.user.id);
    assert.equal(up.body.user.isGuest, false);
  });
});

describe('games catalogue', () => {
  test('lists, searches, filters and sorts', async () => {
    const all = await t.api('/api/games');
    assert.equal(all.status, 200);
    assert.equal(all.body.games.length, 5);
    assert.equal(all.body.games[0].slug, 'pong');

    const search = await t.api('/api/games?search=snake');
    assert.deepEqual(search.body.games.map((g) => g.slug), ['snake']);
    const byTag = await t.api('/api/games?search=idle');
    assert.deepEqual(byTag.body.games.map((g) => g.slug), ['clicker']);

    const puzzle = await t.api('/api/games?category=puzzle');
    assert.deepEqual(puzzle.body.games.map((g) => g.slug), ['memory-match']);
    const multi = await t.api('/api/games?multiplayer=true');
    assert.deepEqual(multi.body.games.map((g) => g.slug).sort(), ['pong', 'tic-tac-toe']);
    const az = await t.api('/api/games?sort=title');
    assert.equal(az.body.games[0].title, 'Cosmic Clicker');
    assert.equal((await t.api('/api/games?sort=bogus')).status, 400);
  });

  test('featured, categories and single game', async () => {
    const featured = await t.api('/api/games/featured');
    assert.deepEqual(featured.body.games.map((g) => g.slug), ['pong', 'snake']);
    const cats = await t.api('/api/games/categories');
    assert.equal(cats.body.multiplayer, 2);
    assert.ok(cats.body.categories.find((c) => c.name === 'Arcade' && c.count === 2));
    const one = await t.api('/api/games/snake');
    assert.equal(one.body.game.assets.icon, '🐍');
    assert.equal((await t.api('/api/games/nope')).status, 404);
  });

  test('admin can register an external game; others cannot', async () => {
    const body = { slug: 'demo-ext', title: 'Demo', description: 'x', category: 'Puzzle', url: 'https://example.com/game' };
    assert.equal((await t.api('/api/games', { method: 'POST', body })).status, 403);
    assert.equal((await t.api('/api/games', { method: 'POST', body, headers: { 'x-admin-key': 'wrong' } })).status, 403);
    const ok = await t.api('/api/games', { method: 'POST', body, headers: { 'x-admin-key': 'test-admin-key' } });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.game.type, 'external');
    const badUrl = await t.api('/api/games', { method: 'POST', body: { ...body, slug: 'bad-one', url: 'javascript:alert(1)' }, headers: { 'x-admin-key': 'test-admin-key' } });
    assert.equal(badUrl.status, 400, 'javascript: URLs are refused');
  });

  test('play counter increments games played', async () => {
    const g = await t.guest();
    assert.equal((await t.api('/api/games/snake/play', { method: 'POST' })).status, 401);
    const r = await t.api('/api/games/snake/play', { method: 'POST', token: g.token });
    assert.equal(r.body.counted, true);
    const me = await t.api('/api/auth/me', { token: g.token });
    assert.equal(me.body.stats.gamesPlayed, 1);
    const game = await t.api('/api/games/snake');
    assert.equal(game.body.game.plays, 1);
  });

  test('save states round-trip per user and game', async () => {
    const a = await t.guest();
    const b = await t.guest();
    assert.equal((await t.api('/api/games/clicker/save', { token: a.token })).body.save, null);
    const put = await t.api('/api/games/clicker/save', { method: 'PUT', token: a.token, body: { data: { dust: 42, upgrades: [1, 2] } } });
    assert.equal(put.status, 200);
    await t.api('/api/games/clicker/save', { method: 'PUT', token: a.token, body: { data: { dust: 99 } } }); // upsert
    const got = await t.api('/api/games/clicker/save', { token: a.token });
    assert.deepEqual(got.body.save.data, { dust: 99 });
    assert.equal((await t.api('/api/games/clicker/save', { token: b.token })).body.save, null, 'saves are private');
    const huge = await t.api('/api/games/clicker/save', { method: 'PUT', token: a.token, body: { data: { blob: 'x'.repeat(70_000) } } });
    assert.equal(huge.status, 413);
    assert.equal((await t.api('/api/games/clicker/save', { method: 'PUT', token: a.token, body: { data: 'nope' } })).status, 400);
  });
});

describe('scores & leaderboards', () => {
  test('submit, personal best, ranking and global board', async () => {
    const p1 = (await register('Ranker1')).body;
    const p2 = (await register('Ranker2')).body;
    const p3 = (await register('Ranker3')).body;

    const submit = (token, game, score) => t.api('/api/scores', { method: 'POST', token, body: { game, score } });

    const first = await submit(p1.token, 'snake', 100);
    assert.equal(first.status, 201);
    assert.equal(first.body.isPersonalBest, true);
    assert.deepEqual(first.body.standing, { score: 100, rank: 1 });

    assert.equal((await submit(p2.token, 'snake', 300)).body.standing.rank, 1);
    const low = await submit(p1.token, 'snake', 50);
    assert.equal(low.body.isPersonalBest, false);
    assert.deepEqual(low.body.standing, { score: 100, rank: 2 }, 'best score is kept');

    await submit(p3.token, 'snake', 100); // ties with p1
    await submit(p1.token, 'memory-match', 500);

    const board = await t.api('/api/scores/game/snake?limit=10', { token: p3.token });
    assert.equal(board.status, 200);
    assert.equal(board.body.scoring, 'best');
    const names = board.body.entries.map((e) => [e.username, e.score, e.rank]);
    assert.deepEqual(names.slice(0, 3), [['Ranker2', 300, 1], ['Ranker1', 100, 2], ['Ranker3', 100, 2]]);
    assert.deepEqual(board.body.me, { score: 100, rank: 2 });

    const global = await t.api('/api/scores/leaderboard');
    const g = global.body.entries;
    assert.equal(g[0].username, 'Ranker1', '100 + 500 points across two games');
    assert.equal(g[0].score, 600);
    assert.equal(g[0].rank, 1);

    const me = await t.api('/api/scores/me', { token: p1.token });
    assert.equal(me.body.stats.points, 600);
    assert.equal(me.body.stats.rank, 1);
    assert.equal(me.body.stats.perGame.length, 2);
    assert.equal(me.body.stats.recent.length, 3);
  });

  test('validation and anti-cheat guards', async () => {
    const g = await t.guest();
    const post = (body, token = g.token) => t.api('/api/scores', { method: 'POST', token, body });
    assert.equal((await post({ game: 'snake', score: 1 }, null)).status, 401);
    assert.equal((await post({ game: 'snake', score: -5 })).status, 400);
    assert.equal((await post({ game: 'snake', score: 1.5 })).status, 400);
    assert.equal((await post({ game: 'snake', score: '10' })).status, 400);
    assert.equal((await post({ game: 'snake', score: 999_999 })).status, 422, 'above maxScore');
    assert.equal((await post({ game: 'ghost', score: 1 })).status, 404);
    assert.equal((await post({ game: 'pong', score: 1 })).status, 403, 'multiplayer scores are server-only');
    assert.equal((await t.api('/api/scores/game/ghost')).status, 404);
    assert.equal((await t.api('/api/scores/leaderboard?limit=1000')).status, 400);
  });
});

test('unknown API routes return JSON 404', async () => {
  const res = await t.api('/api/nope');
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'NOT_FOUND');
});
