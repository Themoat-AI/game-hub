import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { PONG, pong } from '../src/games/pong.js';
import { findWinner, ticTacToe } from '../src/games/tictactoe.js';

describe('tic-tac-toe engine', () => {
  const play = (state, moves) => moves.forEach(([p, cell]) => assert.deepEqual(ticTacToe.onAction(state, p, { cell }), {}));

  test('detects a row win and awards points', () => {
    const s = ticTacToe.create();
    play(s, [[0, 0], [1, 3], [0, 1], [1, 4], [0, 2]]);
    assert.equal(s.over, true);
    assert.deepEqual(s.line, [0, 1, 2]);
    const result = ticTacToe.result(s);
    assert.equal(result.winner, 0);
    assert.deepEqual(ticTacToe.rewards(result), [10, 0]);
  });

  test('detects a draw', () => {
    const s = ticTacToe.create();
    // Final board:  X O X / X O O / O X X
    const order = [[0, 0], [1, 1], [0, 2], [1, 4], [0, 3], [1, 5], [0, 7], [1, 6], [0, 8]];
    play(s, order);
    assert.equal(s.draw, true);
    const result = ticTacToe.result(s);
    assert.equal(result.winner, null);
    assert.deepEqual(ticTacToe.rewards(result), [3, 3]);
  });

  test('rejects illegal moves', () => {
    const s = ticTacToe.create();
    assert.match(ticTacToe.onAction(s, 1, { cell: 0 }).error, /turn/);
    ticTacToe.onAction(s, 0, { cell: 4 });
    assert.match(ticTacToe.onAction(s, 1, { cell: 4 }).error, /taken/);
    assert.match(ticTacToe.onAction(s, 1, { cell: 9 }).error, /Invalid/);
    assert.match(ticTacToe.onAction(s, 1, { cell: 'x' }).error, /Invalid/);
  });

  test('findWinner handles diagonals and empty boards', () => {
    assert.equal(findWinner(Array(9).fill(null)), null);
    assert.equal(findWinner([1, null, null, null, 1, null, null, null, 1]).winner, 1);
  });
});

describe('pong engine', () => {
  const steady = () => 0.5; // deterministic rng
  const run = (state, seconds, dt = 1 / 60) => {
    const events = [];
    for (let t = 0; t < seconds; t += dt) events.push(...pong.tick(state, dt));
    return events;
  };

  test('countdown → playing → serve', () => {
    const s = pong.create(steady);
    assert.equal(s.phase, 'countdown');
    run(s, PONG.COUNTDOWN + 0.1);
    assert.equal(s.phase, 'playing');
    assert.ok(Math.hypot(s.ball.vx, s.ball.vy) > 300);
  });

  test('ball bounces off walls and stays in bounds', () => {
    const s = pong.create(steady);
    s.phase = 'playing';
    s.ball = { x: 400, y: 20, vx: 0, vy: -300 };
    pong.tick(s, 0.1);
    assert.ok(s.ball.vy > 0, 'vy flipped');
    assert.ok(s.ball.y >= PONG.BALL_R);
  });

  test('paddle returns the ball and speeds it up', () => {
    const s = pong.create(steady);
    s.phase = 'playing';
    const faceX = PONG.PADDLE_MARGIN + PONG.PADDLE_W;
    s.ball = { x: faceX + PONG.BALL_R + 2, y: PONG.H / 2, vx: -400, vy: 0 };
    s.paddles[0] = PONG.H / 2;
    pong.tick(s, 1 / 60);
    assert.ok(s.ball.vx > 0, 'ball heads right after the hit');
    assert.ok(Math.hypot(s.ball.vx, s.ball.vy) > 400, 'speed increased');
  });

  test('missing the ball scores for the opponent, then the match ends at 7', () => {
    const s = pong.create(steady);
    s.phase = 'playing';
    s.paddles = [0 + PONG.PADDLE_H / 2, 0 + PONG.PADDLE_H / 2]; // parked at the top
    s.ball = { x: 30, y: 400, vx: -500, vy: 0 };
    const events = run(s, 1);
    assert.deepEqual(events.find((e) => e.type === 'score'), { type: 'score', player: 1 });
    assert.equal(s.scores[1], 1);
    assert.equal(s.phase, 'countdown');

    s.scores = [0, PONG.WIN_SCORE - 1];
    s.phase = 'playing';
    s.ball = { x: 30, y: 400, vx: -500, vy: 0 };
    run(s, 1);
    assert.equal(s.phase, 'over');
    const result = pong.result(s);
    assert.equal(result.winner, 1);
    assert.deepEqual(pong.rewards(result), [0, 10 + PONG.WIN_SCORE]);
  });

  test('paddles obey direction input and clamp to the court', () => {
    const s = pong.create(steady);
    assert.deepEqual(pong.onAction(s, 0, { dir: -1 }), {});
    run(s, 2);
    assert.equal(s.paddles[0], PONG.PADDLE_H / 2);
    assert.ok(pong.onAction(s, 0, { dir: 5 }).error);
  });
});
