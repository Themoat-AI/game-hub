import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

function Stat({ label, value, tone = 'text-ink-100' }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900/60 p-3 text-center">
      <div className={`font-display text-xl font-extrabold tabular-nums ${tone}`}>{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wider text-ink-400">{label}</div>
    </div>
  );
}

/** Dashboard stats: games played, hub points, global rank, personal bests. */
export default function StatsPanel() {
  const { user, stats, isAuthed, isGuest } = useAuth();

  if (!isAuthed) {
    return (
      <div className="panel p-5">
        <h3 className="font-display text-sm font-bold uppercase tracking-wider text-neon-cyan">Player card</h3>
        <p className="mt-2 text-sm text-ink-200">
          Sign in or hop in as a guest to track your scores, climb the leaderboards and unlock multiplayer.
        </p>
        <Link to="/login" className="btn-primary mt-4 w-full">
          Sign in / Sign up
        </Link>
      </div>
    );
  }

  const bests = (stats?.perGame ?? []).slice().sort((a, b) => b.score - a.score).slice(0, 4);

  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-bold uppercase tracking-wider text-neon-cyan">Player card</h3>
        {isGuest && <span className="chip">guest</span>}
      </div>
      <p className="mt-1 truncate text-lg font-bold">{user.username}</p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Played" value={stats?.gamesPlayed ?? user.gamesPlayed} />
        <Stat label="Points" value={(stats?.points ?? 0).toLocaleString()} tone="text-neon-lime" />
        <Stat label="Rank" value={stats?.rank ? `#${stats.rank}` : '—'} tone="text-neon-amber" />
      </div>

      <h4 className="mb-1 mt-4 text-[11px] font-medium uppercase tracking-wider text-ink-400">Your high scores</h4>
      {bests.length ? (
        <ul className="space-y-1.5 text-sm">
          {bests.map((b) => (
            <li key={b.slug} className="flex items-center justify-between gap-2">
              <Link to={`/play/${b.slug}`} className="truncate text-ink-200 hover:text-neon-cyan">
                {b.title}
              </Link>
              <span className="shrink-0 font-display tabular-nums text-ink-100">
                {b.score.toLocaleString()} <span className="text-xs text-ink-400">#{b.rank}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-400">Play a game to set your first score.</p>
      )}

      {isGuest && (
        <Link to="/login?mode=register" className="btn-ghost mt-4 w-full">
          Create account to keep progress
        </Link>
      )}
    </div>
  );
}
