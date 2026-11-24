import { useCallback, useEffect, useRef, useState } from 'react';
import { sfx } from '../lib/sound.js';
import { isTyping, sizeStyle } from './util.js';

const COLS = 20;
const ROWS = 20;
const CELL = 24;
const DIRS = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
const KEYS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
};
const BEST_KEY = 'gh_snake_best';

function placeApple(snake) {
  const taken = new Set(snake.map((s) => s.y * COLS + s.x));
  const free = [];
  for (let i = 0; i < COLS * ROWS; i++) if (!taken.has(i)) free.push(i);
  if (!free.length) return null;
  const i = free[Math.floor(Math.random() * free.length)];
  return { x: i % COLS, y: Math.floor(i / COLS) };
}

function newGame() {
  const snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
  return { snake, dir: 'right', queue: [], apple: placeApple(snake), score: 0, acc: 0 };
}

const interval = (score) => Math.max(65, 135 - (score / 10) * 3); // ms per step; speeds up as you eat

/** Advance one cell. Returns 'moved' | 'ate' | 'dead' | 'won'. */
function step(g) {
  if (g.queue.length) {
    const next = g.queue.shift();
    if (next !== OPPOSITE[g.dir]) g.dir = next;
  }
  const d = DIRS[g.dir];
  const head = { x: g.snake[0].x + d.x, y: g.snake[0].y + d.y };
  if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS) return 'dead';
  const eating = g.apple && head.x === g.apple.x && head.y === g.apple.y;
  const body = eating ? g.snake : g.snake.slice(0, -1); // the tail moves away unless we grow
  if (body.some((s) => s.x === head.x && s.y === head.y)) return 'dead';
  g.snake.unshift(head);
  if (!eating) {
    g.snake.pop();
    return 'moved';
  }
  g.score += 10;
  g.apple = placeApple(g.snake);
  return g.apple ? 'ate' : 'won';
}

function draw(ctx, g, t) {
  ctx.fillStyle = '#06050d';
  ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL);
  ctx.fillStyle = 'rgba(124,120,168,0.16)';
  for (let x = 0; x < COLS; x++) for (let y = 0; y < ROWS; y++) ctx.fillRect(x * CELL + CELL / 2 - 1, y * CELL + CELL / 2 - 1, 2, 2);

  if (g.apple) {
    const pulse = 1 + Math.sin(t / 160) * 0.08;
    ctx.save();
    ctx.shadowColor = '#ff3cac';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#ff3cac';
    ctx.beginPath();
    ctx.arc(g.apple.x * CELL + CELL / 2, g.apple.y * CELL + CELL / 2, (CELL / 2 - 4) * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.shadowColor = '#b6ff3c';
  ctx.shadowBlur = 12;
  g.snake.forEach((s, i) => {
    const k = i / Math.max(1, g.snake.length - 1);
    ctx.fillStyle = i === 0 ? '#e9ffb8' : `hsl(${80 + k * 90} 95% ${58 - k * 12}%)`;
    const pad = i === 0 ? 1.5 : 2.5;
    ctx.beginPath();
    ctx.roundRect(s.x * CELL + pad, s.y * CELL + pad, CELL - pad * 2, CELL - pad * 2, 6);
    ctx.fill();
  });
  ctx.restore();
}

export default function SnakeGame({ host, fullscreen }) {
  const hostRef = useRef(host);
  hostRef.current = host;
  const canvasRef = useRef(null);
  const game = useRef(newGame());
  const statusRef = useRef('ready');
  const [status, setStatus] = useState('ready'); // ready | playing | over
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => {
    try {
      return Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch {
      return 0;
    }
  });
  const touch = useRef(null);

  const setStatusBoth = (s) => {
    statusRef.current = s;
    setStatus(s);
  };

  const start = useCallback(() => {
    game.current = newGame();
    setScore(0);
    hostRef.current.setLiveScore(0);
    setStatusBoth('playing');
  }, []);

  const end = useCallback((won = false) => {
    const final = game.current.score;
    setStatusBoth('over');
    won ? sfx.win() : sfx.die();
    setBest((b) => {
      const nb = Math.max(b, final);
      try {
        localStorage.setItem(BEST_KEY, String(nb));
      } catch {
        /* ignore */
      }
      return nb;
    });
    if (final > 0) hostRef.current.submitScore(final);
  }, []);

  const turn = useCallback((dir) => {
    const g = game.current;
    const last = g.queue.at(-1) ?? g.dir;
    if (dir === last || dir === OPPOSITE[last] || g.queue.length >= 2) return;
    g.queue.push(dir);
  }, []);

  // Game loop (render + fixed-interval stepping)
  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d');
    let raf;
    let prev = performance.now();
    const loop = (t) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(100, t - prev);
      prev = t;
      const g = game.current;
      if (statusRef.current === 'playing' && !hostRef.current.paused) {
        g.acc += dt;
        let iv = interval(g.score);
        while (g.acc >= iv && statusRef.current === 'playing') {
          g.acc -= iv;
          const r = step(g);
          if (r === 'ate' || r === 'won') {
            sfx.eat();
            setScore(g.score);
            hostRef.current.setLiveScore(g.score);
          }
          if (r === 'dead') end(false);
          if (r === 'won') end(true);
          iv = interval(g.score);
        }
      }
      draw(ctx, g, t);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [end]);

  // Keyboard
  useEffect(() => {
    const onKey = (e) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey) return;
      const dir = KEYS[e.key];
      const startKey = e.key === ' ' || e.key === 'Enter';
      if (!dir && !startKey) return;
      if (e.target?.tagName === 'BUTTON' && startKey) return; // let focused buttons handle Space/Enter
      e.preventDefault();
      if (hostRef.current.paused) return;
      if (statusRef.current !== 'playing') {
        start();
        if (dir && dir !== 'left') game.current.dir = dir; // can't start by going into your own tail
        return;
      }
      if (dir) turn(dir);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [start, turn]);

  // Swipe
  const onTouchStart = (e) => {
    const t = e.changedTouches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e) => {
    const t = e.changedTouches[0];
    const s = touch.current;
    touch.current = null;
    if (!s || hostRef.current.paused) return;
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) {
      if (statusRef.current !== 'playing') start();
      return;
    }
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    if (statusRef.current !== 'playing') start();
    else turn(dir);
  };

  const pad = (dir, label, cls) => (
    <button
      type="button"
      aria-label={dir}
      className={`btn-ghost !h-14 !w-14 !rounded-2xl !p-0 text-xl ${cls}`}
      onPointerDown={(e) => {
        e.preventDefault();
        if (hostRef.current.paused) return;
        if (statusRef.current !== 'playing') start();
        else turn(dir);
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="flex w-full max-w-md items-center justify-between font-display text-sm">
        <span>
          Score <b className="text-neon-lime">{score}</b>
        </span>
        <span className="text-ink-400">
          Best <b className="text-ink-100">{best}</b>
        </span>
      </div>

      <div className="relative" style={sizeStyle(1, fullscreen)}>
        <canvas
          ref={canvasRef}
          width={COLS * CELL}
          height={ROWS * CELL}
          className="h-full w-full rounded-xl border border-ink-600 bg-ink-950"
          style={{ touchAction: 'none' }}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        />
        {status !== 'playing' && (
          <div className="absolute inset-0 grid place-items-center rounded-xl bg-ink-950/70 text-center backdrop-blur-[2px]">
            <div>
              {status === 'over' ? (
                <>
                  <p className="font-display text-2xl font-black text-neon-pink">GAME OVER</p>
                  <p className="mt-1 text-sm text-ink-200">
                    Score <b className="text-neon-lime">{score}</b>
                    {score > 0 && score >= best ? ' · new best!' : ''}
                  </p>
                </>
              ) : (
                <p className="font-display text-xl font-black text-neon-cyan">NEON SNAKE</p>
              )}
              <button className="btn-primary mt-4" onClick={start}>
                {status === 'over' ? 'Play again' : '▶ Start'}
              </button>
              <p className="mt-2 text-xs text-ink-400">or press Space</p>
            </div>
          </div>
        )}
      </div>

      {/* On-screen D-pad for touch devices */}
      <div className="hidden grid-cols-3 gap-1.5 pointer-coarse:grid">
        <span />
        {pad('up', '▲', '')}
        <span />
        {pad('left', '◀', '')}
        {pad('down', '▼', '')}
        {pad('right', '▶', '')}
      </div>
    </div>
  );
}
