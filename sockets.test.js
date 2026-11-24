import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { emit, once, sleep, startTestServer } from './helpers.js';

let t;
before(async () => {
  t = await startTestServer({ matchGraceMs: 400 });
});
after(() => t.close());

/** Two guests, two sockets, matched through the queue. Returns players sorted by seat. */
async function pairUp(game) {
  const accounts = [await t.guest(), await t.guest()];
  const socks = [await t.connect(accounts[0].token), await t.connect(accounts[1].token)];
  const found = socks.map((s) => once(s, 'match:found'));
  const first = await emit(socks[0], 'queue:join', { game });
  assert.equal(first.status, 'waiting');
  const second = await emit(socks[1], 'queue:join', { game });
  assert.equal(second.status, 'matched');
  const infos = await Promise.all(found);
  const players = infos.map((info, i) => ({ info, sock: socks[i], acct: accounts[i], matchId: info.matchId }));
  assert.equal(players[0].matchId, players[1].matchId);
  assert.notEqual(players[0].info.you, players[1].info.you);
  return players.sort((p, q) => p.info.you - q.info.you); // [seat 0, seat 1]
}

describe('socket auth', () => {
  test('rejects missing and invalid tokens', async () => {
    await assert.rejects(t.connect(undefined), /AUTH_REQUIRED/);
    await assert.rejects(t.connect('not-a-jwt'), /AUTH_INVALID/);
  });
});

describe('lobby chat', () => {
  test('messages reach everyone in the lobby; presence and history work', async () => {
    const a = await t.guest();
    const b = await t.guest();
    const sa = await t.connect(a.token);
    const sb = await t.connect(b.token);

    assert.equal((await emit(sa, 'chat:send', { room: 'global', text: 'hi?' })).ok, false, 'must join first');
    assert.equal((await emit(sa, 'lobby:join', { room: 'nope' })).ok, false);

    const joinA = await emit(sa, 'lobby:join', { room: 'global' });
    assert.equal(joinA.ok, true);
    const presence = once(sb, 'lobby:presence');
    await emit(sb, 'lobby:join', { room: 'global' });
    const p = await presence;
    assert.ok(p.users.length >= 2);

    const got = once(sb, 'chat:message');
    const sent = await emit(sa, 'chat:send', { room: 'global', text: '  hello   world  ' });
    assert.equal(sent.ok, true);
    const msg = await got;
    assert.equal(msg.text, 'hello world', 'whitespace is normalised');
    assert.equal(msg.username, a.user.username);

    const late = await t.guest();
    const sl = await t.connect(late.token);
    const joined = await emit(sl, 'lobby:join', { room: 'global' });
    assert.ok(joined.history.some((m) => m.text === 'hello world'), 'late joiners see recent history');

    assert.equal((await emit(sa, 'chat:send', { room: 'global', text: '   ' })).ok, false);
    const long = once(sb, 'chat:message');
    await emit(sa, 'chat:send', { room: 'global', text: 'x'.repeat(1000) });
    assert.equal((await long).text.length, 300, 'long messages are truncated');
  });

  test('chat is rate limited', async () => {
    const a = await t.guest();
    const sa = await t.connect(a.token);
    await emit(sa, 'lobby:join', { room: 'pong' });
    const results = [];
    for (let i = 0; i < 8; i++) results.push((await emit(sa, 'chat:send', { room: 'pong', text: `m${i}` })).ok);
    assert.equal(results.filter(Boolean).length, 5);
  });
});

describe('tic-tac-toe over WebSockets', () => {
  test('full game: matchmaking, validation, win, persistence, rematch', async () => {
    const [X, O] = await pairUp('tic-tac-toe');
    const matchId = X.matchId;

    const syncX = await emit(X.sock, 'match:sync', { matchId });
    assert.equal(syncX.ok, true);
    assert.equal(syncX.state.turn, 0);
    assert.equal((await emit(O.sock, 'match:sync', { matchId })).ok, true);
    assert.equal((await emit(X.sock, 'match:sync', { matchId: 'bogus' })).ok, false);

    const outOfTurn = await emit(O.sock, 'match:action', { matchId, action: { cell: 0 } });
    assert.equal(outOfTurn.ok, false);

    const overX = once(X.sock, 'match:over');
    const overO = once(O.sock, 'match:over');
    for (const [p, cell] of [[X, 0], [O, 3], [X, 1], [O, 4], [X, 2]]) {
      const r = await emit(p.sock, 'match:action', { matchId, action: { cell } });
      assert.equal(r.ok, true, `move ${cell}`);
    }
    const result = await overX;
    assert.deepEqual(await overO, result);
    assert.equal(result.winner, 0);
    assert.equal(result.reason, 'normal');
    assert.deepEqual(result.rewards, [10, 0]);

    assert.equal((await emit(O.sock, 'match:action', { matchId, action: { cell: 5 } })).ok, false, 'no moves after the end');

    await t.matches.idle();
    const board = await t.api('/api/scores/game/tic-tac-toe');
    assert.deepEqual(board.body.entries.map((e) => [e.username, e.score]), [[X.acct.user.username, 10]]);
    assert.equal(board.body.scoring, 'total');
    const meX = await t.api('/api/auth/me', { token: X.acct.token });
    const meO = await t.api('/api/auth/me', { token: O.acct.token });
    assert.equal(meX.body.stats.gamesPlayed, 1);
    assert.equal(meO.body.stats.gamesPlayed, 1);

    // Rematch → brand-new match with the same two players.
    const foundX = once(X.sock, 'match:found');
    const foundO = once(O.sock, 'match:found');
    const asked = once(O.sock, 'match:rematch');
    await emit(X.sock, 'match:rematch', { matchId });
    assert.equal((await asked).from, X.acct.user.username);
    await emit(O.sock, 'match:rematch', { matchId });
    const [nx, no] = await Promise.all([foundX, foundO]);
    assert.equal(nx.matchId, no.matchId);
    assert.notEqual(nx.matchId, matchId);
  });

  test('a player already in a match cannot queue again', async () => {
    const [p] = await pairUp('tic-tac-toe');
    const again = await emit(p.sock, 'queue:join', { game: 'tic-tac-toe' });
    assert.equal(again.ok, false);
    assert.equal(again.code, 'IN_MATCH');
    assert.equal((await emit(p.sock, 'queue:join', { game: 'bogus' })).ok, false);
  });
});

describe('real-time Pong', () => {
  test('server streams state, applies paddle input, and handles forfeits', async () => {
    const [L, R] = await pairUp('pong');
    const matchId = L.matchId;
    const sync = await emit(L.sock, 'match:sync', { matchId });
    assert.equal(sync.config.W, 800);
    assert.equal(sync.state.phase, 'countdown');

    await sleep(150);
    // The simulation is paused until both players are in.
    const frozen = (await emit(L.sock, 'match:sync', { matchId })).state;
    assert.equal(frozen.cd, 3, 'countdown has not started yet');
    await emit(R.sock, 'match:sync', { matchId });

    await emit(L.sock, 'match:action', { matchId, action: { dir: -1 } });
    assert.equal((await emit(L.sock, 'match:action', { matchId, action: { dir: 9 } })).ok, false);

    const frames = [];
    L.sock.on('match:state', (m) => frames.push(m.state));
    await sleep(500);
    L.sock.off('match:state');
    assert.ok(frames.length >= 8, `expected ~30Hz stream, got ${frames.length}`);
    const last = frames.at(-1);
    assert.ok(last.paddles[0] < 250, 'left paddle moved up');
    assert.equal(last.paddles[1], 250, 'right paddle did not');
    assert.ok(last.cd < 3, 'countdown running');

    const overL = once(L.sock, 'match:over');
    const gone = once(R.sock, 'match:opponent');
    await emit(L.sock, 'match:leave', { matchId }); // left player forfeits
    const result = await overL;
    assert.equal(result.winner, 1);
    assert.equal(result.reason, 'forfeit');
    assert.equal((await gone).status, 'left');

    await t.matches.idle();
    const board = await t.api('/api/scores/game/pong');
    assert.equal(board.body.entries[0].username, R.acct.user.username);
    assert.equal(board.body.entries[0].score, 10);
  });
});

describe('private rooms', () => {
  test('create → join by code starts a match', async () => {
    const a = await t.guest();
    const b = await t.guest();
    const sa = await t.connect(a.token);
    const sb = await t.connect(b.token);

    const room = await emit(sa, 'room:create', { game: 'tic-tac-toe' });
    assert.equal(room.ok, true);
    assert.match(room.code, /^[A-Z2-9]{5}$/);

    assert.equal((await emit(sa, 'room:join', { code: room.code })).ok, false, "can't join your own room");
    assert.equal((await emit(sb, 'room:join', { code: 'ZZZZZ' })).ok, false);

    const foundA = once(sa, 'match:found');
    const foundB = once(sb, 'match:found');
    const joined = await emit(sb, 'room:join', { code: room.code.toLowerCase() });
    assert.equal(joined.ok, true);
    const [ia, ib] = await Promise.all([foundA, foundB]);
    assert.equal(ia.matchId, ib.matchId);
    assert.equal((await emit(sb, 'room:join', { code: room.code })).ok, false, 'code is single-use');
  });
});

describe('disconnect handling', () => {
  test('reconnecting within the grace period resumes the match', async () => {
    const [p, q] = await pairUp('tic-tac-toe');
    await emit(p.sock, 'match:sync', { matchId: p.matchId });
    await emit(q.sock, 'match:sync', { matchId: q.matchId });

    const away = once(q.sock, 'match:opponent');
    p.sock.disconnect();
    const evt = await away;
    assert.equal(evt.status, 'disconnected');

    const back = once(q.sock, 'match:opponent');
    const p2 = await t.connect(p.acct.token);
    const resumed = await Promise.race([p2.resumed, sleep(3000).then(() => assert.fail('no match:resume'))]);
    assert.equal(resumed.matchId, p.matchId);
    assert.equal(resumed.you, p.info.you);
    assert.equal((await back).status, 'reconnected');

    let forfeited = false;
    q.sock.once('match:over', () => (forfeited = true));
    await sleep(600); // longer than the 400ms grace
    assert.equal(forfeited, false);
    const sync = await emit(p2, 'match:sync', { matchId: p.matchId });
    assert.equal(sync.ok, true);
  });

  test('staying away past the grace period forfeits', async () => {
    const [p, q] = await pairUp('tic-tac-toe');
    const over = once(q.sock, 'match:over', 3000);
    p.sock.disconnect();
    const result = await over;
    assert.equal(result.reason, 'disconnect');
    assert.equal(result.winner, q.info.you);
    await t.matches.idle();
  });
});
