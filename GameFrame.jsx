import { useEffect, useRef, useState } from 'react';

function IconButton({ label, onClick, active, disabled, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`grid h-9 w-9 place-items-center rounded-lg border text-base transition disabled:cursor-not-allowed disabled:opacity-40
        ${active ? 'border-neon-cyan/70 bg-neon-cyan/15 text-neon-cyan' : 'border-ink-600 bg-ink-800/70 text-ink-100 hover:border-ink-400'}`}
    >
      {children}
    </button>
  );
}

/**
 * Unified game wrapper: every game (built-in or embedded) gets the same
 * pause / sound / fullscreen controls and a live score readout.
 *
 * `children` is a render function so the wrapper can pass the layout state down:
 *   <GameFrame ...>{({ fullscreen }) => <Game fullscreen={fullscreen} />}</GameFrame>
 */
export default function GameFrame({ game, paused, muted, canPause, onTogglePause, onToggleMute, liveScore, children }) {
  const ref = useRef(null);
  const [fullscreen, setFullscreen] = useState(false);
  const canFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled;

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await ref.current?.requestFullscreen();
    } catch {
      /* user denied or unsupported */
    }
  }

  return (
    <div ref={ref} className={`flex flex-col overflow-hidden border border-ink-600/60 bg-ink-900 ${fullscreen ? 'h-full' : 'rounded-2xl'}`}>
      <div className="flex items-center gap-3 border-b border-ink-700/70 bg-ink-800/80 px-3 py-2">
        <span className="text-xl" aria-hidden>
          {game.assets?.icon}
        </span>
        <h1 className="min-w-0 flex-1 truncate font-display text-sm font-bold sm:text-base">{game.title}</h1>
        {liveScore !== undefined && liveScore !== null && (
          <span className="rounded-lg border border-ink-600 bg-ink-900 px-2.5 py-1 font-display text-sm tabular-nums text-neon-lime">
            {Number(liveScore).toLocaleString()}
          </span>
        )}
        <div className="flex gap-1.5">
          <IconButton label={paused ? 'Resume' : 'Pause'} onClick={onTogglePause} active={paused} disabled={!canPause}>
            {paused ? '▶' : '❚❚'}
          </IconButton>
          <IconButton label={muted ? 'Unmute sound' : 'Mute sound'} onClick={onToggleMute} active={muted}>
            {muted ? '🔇' : '🔊'}
          </IconButton>
          {canFullscreen && (
            <IconButton label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'} onClick={toggleFullscreen} active={fullscreen}>
              ⛶
            </IconButton>
          )}
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-ink-950/60 p-2 sm:p-4">
        {children({ fullscreen })}
        {paused && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-ink-950/80 backdrop-blur-sm">
            <div className="text-center">
              <p className="font-display text-2xl font-black tracking-widest text-neon-cyan">PAUSED</p>
              <button className="btn-primary mt-4" onClick={onTogglePause}>
                ▶ Resume
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
