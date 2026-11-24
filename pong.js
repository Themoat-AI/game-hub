// Pure, server-authoritative Pong engine. Player 0 = left paddle, player 1 = right.
// The server steps the simulation at 60 Hz; clients only send paddle direction (-1/0/1).

export const PONG = {
  W: 800,
  H: 500,
  PADDLE_W: 12,
  PADDLE_H: 90,
  PADDLE_MARGIN: 24,
  BALL_R: 8,
  PADDLE_SPEED: 480, // px / s
  BALL_START: 340, // px / s
  BALL_MAX: 760,
  SPEEDUP: 1.06, // per paddle hit
  MAX_BOUNCE: Math.PI / 3.2,
  WIN_SCORE: 7,
  COUNTDOWN: 3, // seconds before the first serve
  POINT_PAUSE: 1, // seconds between points
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round1 = (v) => Math.round(v * 10) / 10;

function centre(state) {
  state.ball.x = PONG.W / 2;
  state.ball.y = PONG.H / 2;
  state.ball.vx = 0;
  state.ball.vy = 0;
}

function serve(state, rng = Math.random) {
  const angle = (rng() * 2 - 1) * (Math.PI / 5);
  state.ball.vx = state.serveDir * Math.cos(angle) * PONG.BALL_START;
  state.ball.vy = Math.sin(angle) * PONG.BALL_START;
}

export const pong = {
  slug: 'pong',
  config: PONG, // sent to clients so they can render at the same scale

  create(rng = Math.random) {
    const state = {
      phase: 'countdown', // countdown | playing | over
      cd: PONG.COUNTDOWN,
      ball: { x: PONG.W / 2, y: PONG.H / 2, vx: 0, vy: 0 },
      paddles: [PONG.H / 2, PONG.H / 2], // paddle centre Y
      dirs: [0, 0],
      scores: [0, 0],
      serveDir: rng() < 0.5 ? -1 : 1,
      winner: null,
      rng,
    };
    return state;
  },

  /** action = { dir: -1 | 0 | 1 } */
  onAction(state, player, action) {
    const dir = action?.dir;
    if (dir !== -1 && dir !== 0 && dir !== 1) return { error: 'Invalid direction' };
    state.dirs[player] = dir;
    return {};
  },

  /** Advance by dt seconds. Returns events: [{type:'score', player}] */
  tick(state, dt) {
    const events = [];
    if (state.phase === 'over') return events;
    const { W, H, PADDLE_W, PADDLE_H, PADDLE_MARGIN, BALL_R } = PONG;

    // Paddles always move (even during countdowns) so inputs feel responsive.
    for (let i = 0; i < 2; i++) {
      state.paddles[i] = clamp(state.paddles[i] + state.dirs[i] * PONG.PADDLE_SPEED * dt, PADDLE_H / 2, H - PADDLE_H / 2);
    }

    if (state.phase === 'countdown') {
      state.cd -= dt;
      if (state.cd <= 0) {
        state.cd = 0;
        state.phase = 'playing';
        serve(state, state.rng);
      }
      return events;
    }

    const b = state.ball;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // Walls
    if (b.y - BALL_R < 0) {
      b.y = BALL_R;
      b.vy = Math.abs(b.vy);
    } else if (b.y + BALL_R > H) {
      b.y = H - BALL_R;
      b.vy = -Math.abs(b.vy);
    }

    // Paddles
    const speed = Math.hypot(b.vx, b.vy);
    const leftFace = PADDLE_MARGIN + PADDLE_W;
    const rightFace = W - PADDLE_MARGIN - PADDLE_W;
    const bounce = (paddleIdx, dirX) => {
      const offset = clamp((b.y - state.paddles[paddleIdx]) / (PADDLE_H / 2), -1, 1);
      const angle = offset * PONG.MAX_BOUNCE;
      const next = Math.min(speed * PONG.SPEEDUP, PONG.BALL_MAX);
      b.vx = dirX * Math.cos(angle) * next;
      b.vy = Math.sin(angle) * next;
    };
    if (b.vx < 0 && b.x - BALL_R <= leftFace && b.x + BALL_R >= PADDLE_MARGIN && Math.abs(b.y - state.paddles[0]) <= PADDLE_H / 2 + BALL_R) {
      b.x = leftFace + BALL_R;
      bounce(0, 1);
    } else if (b.vx > 0 && b.x + BALL_R >= rightFace && b.x - BALL_R <= W - PADDLE_MARGIN && Math.abs(b.y - state.paddles[1]) <= PADDLE_H / 2 + BALL_R) {
      b.x = rightFace - BALL_R;
      bounce(1, -1);
    }

    // Scoring
    let scorer = null;
    if (b.x + BALL_R < 0) scorer = 1;
    else if (b.x - BALL_R > W) scorer = 0;
    if (scorer !== null) {
      state.scores[scorer] += 1;
      events.push({ type: 'score', player: scorer });
      centre(state);
      if (state.scores[scorer] >= PONG.WIN_SCORE) {
        state.phase = 'over';
        state.winner = scorer;
      } else {
        state.phase = 'countdown';
        state.cd = PONG.POINT_PAUSE;
        state.serveDir = scorer === 0 ? -1 : 1; // serve toward the player who conceded
      }
    }
    return events;
  },

  snapshot(state) {
    return {
      phase: state.phase,
      cd: round1(state.cd),
      ball: { x: round1(state.ball.x), y: round1(state.ball.y), vx: Math.round(state.ball.vx), vy: Math.round(state.ball.vy) },
      paddles: state.paddles.map(round1),
      dirs: state.dirs,
      scores: state.scores,
      winner: state.winner,
    };
  },

  result(state) {
    if (state.phase !== 'over') return null;
    return { winner: state.winner, scores: [...state.scores] };
  },

  /** Hub points: win bonus 10 + points scored. */
  rewards(result) {
    return [0, 1].map((i) => (result.winner === i ? 10 : 0) + (result.scores?.[i] ?? 0));
  },
};
