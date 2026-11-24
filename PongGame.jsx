import { useEffect, useRef, useState } from 'react';
import MatchLobby from '../components/MatchLobby.jsx';
import { sfx } from '../lib/sound.js';
import { MatchResult, OpponentBanner } from './MatchResult.jsx';
import { isTyping, sizeStyle } from './util.js';
import { useMatch } from './useMatch.js';

const DEFAULT = { W: 800, H: 500, PADDLE_W: 12, PADDLE_H: 90, PADDLE_MARGIN: 24, BALL_R: 8, PADDLE_SPEED: 480 };
const CYAN = '#22f0ff';
const PINK = '#ff3cac';

const KEYMAP = { ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down' };

export default function PongGame({ host, fullscreen }) {
  const hostRef = useRef(host);
  hostRef.current = host;
  const youRef = useRef(null);
  const m = useMatch('pong', {
    onOver: (res) => {
      hostRef.current.matchFinished();
      res.winner === youRef.current ? sfx.win() : sfx.lose();
    },
  });
  const { info, state, over, opponent, snapRef } = m;
  youRef.current = info?.you ?? null;
  const cfg = info?.config ?? DEFAULT;
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  const canvasRef = useRef(null);
  const [rematchSent, setRematchSent] = useState(false);
  useEffect(() => setRematchSent(false), [info?.matchId]);

  // ── input: keys + touch buttons → direction (-1 / 0 / 1), sent only on change ──
  const held = useRef(new Set());
  const dirRef = useRef(0);
  const actRef = useRef(m.act);
  actRef.current = m.act;
  const playing = m.phase === 'playing';

  const syncDir = () => {
    const up = held.current.has('up');
    const down = held.current.has('down');
    const d = up === down ? 0 : up ? -1 : 1;
    if (d !== dirRef.current) {
      dirRef.current = d;
      actRef.current({ dir: d });
    }
  };

  useEffect(() => {
    if (!playing) return;
    held.current.clear();
    dirRef.current = 0;
    const down = (e) => {
      const k = KEYMAP[e.key];
      if (!k || isTyping(e)) return;
      e.preventDefault();
      held.current.add(k);
      syncDir();
    };
    const up = (e) => {
      const k = KEYMAP[e.key];
      if (!k) return;
      held.current.delete(k);
      syncDir();
    };
    const release = () => {
      held.current.clear();
      syncDir();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', release);
    };
  }, [playing, info?.matchId]);

  const holdBtn = (dir, label) => (
    <button
      type="button"
      aria-label={dir === 'up' ? 'Move up' : 'Move down'}
      className="btn-ghost !h-16 flex-1 select-none !rounded-2xl text-2xl"
      style={{ touchAction: 'none' }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        held.current.add(dir);
        syncDir();
      }}
      onPointerUp={() => {
        held.current.delete(dir);
        syncDir();
      }}
      onPointerCancel={() => {
        held.current.delete(dir);
        syncDir();
      }}
    >
      {label}
    </button>
  );

  // ── rendering: draw the latest server snapshot, extrapolated between 30 Hz updates ──
  useEffect(() => {
    if (!playing && m.phase !== 'over') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;
    let lastSign = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = cfgRef.current;
      const snap = snapRef.current;
      const st = snap.state;
      if (!st) return;
      const you = youRef.current ?? 0;
      const dt = Math.min(0.1, (performance.now() - snap.at) / 1000);
      const live = st.phase === 'playing';

      // Extrapolate
      const ball = { x: st.ball.x, y: st.ball.y };
      const paddles = [...st.paddles];
      if (live) {
        ball.x += st.ball.vx * dt;
        ball.y = Math.min(c.H - c.BALL_R, Math.max(c.BALL_R, ball.y + st.ball.vy * dt));
      }
      for (let i = 0; i < 2; i++) {
        paddles[i] = Math.min(c.H - c.PADDLE_H / 2, Math.max(c.PADDLE_H / 2, paddles[i] + st.dirs[i] * c.PADDLE_SPEED * dt));
      }

      // Bounce sound when horizontal direction flips
      const sign = Math.sign(st.ball.vx);
      if (live && sign !== 0 && lastSign !== 0 && sign !== lastSign) sfx.bounce();
      if (sign !== 0) lastSign = sign;

      // Court
      ctx.fillStyle = '#06050d';
      ctx.fillRect(0, 0, c.W, c.H);
      ctx.strokeStyle = 'rgba(124,120,168,.35)';
      ctx.setLineDash([10, 14]);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(c.W / 2, 8);
      ctx.lineTo(c.W / 2, c.H - 8);
      ctx.stroke();
      ctx.setLineDash([]);

      // Scores
      ctx.font = '700 64px ui-monospace, Menlo, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(232,230,248,.18)';
      ctx.fillText(String(st.scores[0]), c.W / 2 - 90, 80);
      ctx.fillText(String(st.scores[1]), c.W / 2 + 90, 80);

      // Paddles
      const px = [c.PADDLE_MARGIN, c.W - c.PADDLE_MARGIN - c.PADDLE_W];
      for (let i = 0; i < 2; i++) {
        const col = i === you ? CYAN : PINK;
        ctx.save();
        ctx.shadowColor = col;
        ctx.shadowBlur = 18;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.roundRect(px[i], paddles[i] - c.PADDLE_H / 2, c.PADDLE_W, c.PADDLE_H, 5);
        ctx.fill();
        ctx.restore();
      }

      // Ball
      ctx.save();
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 20;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, c.BALL_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Countdown
      if (st.phase === 'countdown') {
        ctx.fillStyle = '#fbbf24';
        ctx.font = '900 96px ui-monospace, Menlo, Consolas, monospace';
        ctx.fillText(String(Math.max(1, Math.ceil(st.cd))), c.W / 2, c.H / 2 + 34);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [playing, m.phase, info?.matchId, snapRef]);

  // Sounds for points
  const scoreKey = state ? `${state.scores[0]}-${state.scores[1]}` : '0-0';
  const prevScore = useRef('0-0');
  useEffect(() => {
    if (state && scoreKey !== prevScore.current && scoreKey !== '0-0') sfx.score();
    prevScore.current = scoreKey;
  }, [scoreKey, state]);

  if (m.phase !== 'playing' && m.phase !== 'over') {
    return (
      <MatchLobby
        title="Neon Pong"
        blurb="First to 7 points wins. Win = 10 pts + every point you score."
        phase={m.phase}
        roomCode={m.roomCode}
        connected={m.connected}
        onFind={m.findMatch}
        onCancel={m.cancel}
        onCreateRoom={m.createRoom}
        onJoinRoom={m.joinRoom}
      />
    );
  }

  const you = info.you;
  const left = info.players[0];
  const right = info.players[1];

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="flex w-full max-w-3xl items-center justify-between text-sm font-display font-bold">
        <span className={you === 0 ? 'text-neon-cyan' : 'text-neon-pink'}>
          {you === 0 ? 'You' : left.username}
          <span className="ml-2 text-ink-100">{state?.scores[0]}</span>
        </span>
        <span className="text-xs font-normal text-ink-400">first to 7</span>
        <span className={you === 1 ? 'text-neon-cyan' : 'text-neon-pink'}>
          <span className="mr-2 text-ink-100">{state?.scores[1]}</span>
          {you === 1 ? 'You' : right.username}
        </span>
      </div>

      <OpponentBanner opponent={opponent} />

      <div className="relative" style={sizeStyle(cfg.W / cfg.H, fullscreen)}>
        <canvas
          ref={canvasRef}
          width={cfg.W}
          height={cfg.H}
          className="h-full w-full rounded-xl border border-ink-600 bg-ink-950"
          aria-label="Pong court"
        />
        {over && (
          <div className="absolute inset-0 grid place-items-center overflow-auto rounded-xl bg-ink-950/75 p-2 backdrop-blur-[2px]">
            <MatchResult
              over={over}
              you={you}
              players={info.players}
              rematchFrom={m.rematchFrom}
              rematchSent={rematchSent}
              opponentLeft={opponent?.status === 'left'}
              onRematch={() => {
                setRematchSent(true);
                m.rematch();
              }}
              onLeave={m.leave}
            />
          </div>
        )}
      </div>

      {!over && (
        <>
          <div className="hidden w-full max-w-md gap-3 pointer-coarse:flex">
            {holdBtn('up', '▲')}
            {holdBtn('down', '▼')}
          </div>
          <p className="text-xs text-ink-400 pointer-coarse:hidden">
            You are the <b className={you === 0 ? 'text-neon-cyan' : 'text-neon-pink'}>cyan</b> paddle · W/S or ↑/↓ to move
          </p>
          <button className="btn-ghost !py-1.5 text-xs" onClick={() => window.confirm('Leaving forfeits the match. Leave?') && m.leave()}>
            Forfeit &amp; leave
          </button>
        </>
      )}
    </div>
  );
}
