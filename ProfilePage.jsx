import { useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { PageLoader } from '../components/Spinner.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const ago = (iso) => {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

function Tile({ label, value, tone }) {
  return (
    <div className="panel p-4 text-center">
      <div className={`font-display text-3xl font-black tabular-nums ${tone}`}>{value}</div>
      <div className="mt-1 text-[11px] uppercase tracking-wider text-ink-400">{label}</div>
    </div>
  );
}

export default function ProfilePage() {
  const { user, stats, isAuthed, isGuest, refreshStats } = useAuth();

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  if (!isAuthed) return <Navigate to="/login" replace state={{ from: '/profile' }} />;
  if (!stats) return <PageLoader label="Loading profile…" />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-center gap-4">
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-neon-cyan to-neon-pink font-display text-3xl font-black text-ink-950">
          {user.username[0].toUpperCase()}
        </span>
        <div>
          <h1 className="font-display text-2xl font-black">{user.username}</h1>
          <p className="text-sm text-ink-400">
            {isGuest ? 'Guest account' : user.email || 'Member'} · joined {new Date(user.createdAt).toLocaleDateString()}
          </p>
        </div>
      </header>

      {isGuest && (
        <div className="panel flex flex-wrap items-center justify-between gap-3 border-neon-amber/40 p-4">
          <p className="text-sm text-ink-100">You’re playing as a guest. Create an account to keep your scores on any device.</p>
          <Link to="/login?mode=register" className="btn-primary">
            Create account
          </Link>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Tile label="Games played" value={stats.gamesPlayed} tone="text-ink-100" />
        <Tile label="Hub points" value={stats.points.toLocaleString()} tone="text-neon-lime" />
        <Tile label="Global rank" value={stats.rank ? `#${stats.rank}` : '—'} tone="text-neon-amber" />
      </div>

      <section className="panel p-5">
        <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-neon-cyan">High scores</h2>
        {stats.perGame.length === 0 ? (
          <p className="text-sm text-ink-400">Nothing yet — go set a score!</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wider text-ink-400">
              <tr>
                <th className="pb-2 font-medium">Game</th>
                <th className="pb-2 text-right font-medium">Score</th>
                <th className="pb-2 text-right font-medium">Rank</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/60">
              {stats.perGame.map((g) => (
                <tr key={g.slug}>
                  <td className="py-2">
                    <Link to={`/play/${g.slug}`} className="hover:text-neon-cyan">
                      {g.title}
                    </Link>
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-ink-400">{g.scoring === 'total' ? 'total' : 'best'}</span>
                  </td>
                  <td className="py-2 text-right font-display tabular-nums text-neon-lime">{g.score.toLocaleString()}</td>
                  <td className="py-2 text-right font-display tabular-nums text-ink-200">#{g.rank}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel p-5">
        <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-neon-pink">Recent activity</h2>
        {stats.recent.length === 0 ? (
          <p className="text-sm text-ink-400">No recent scores.</p>
        ) : (
          <ul className="divide-y divide-ink-700/60 text-sm">
            {stats.recent.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2">
                <Link to={`/play/${s.game}`} className="hover:text-neon-cyan">
                  {s.gameTitle}
                </Link>
                <span className="flex items-baseline gap-3">
                  <b className="font-display tabular-nums text-ink-100">{s.score.toLocaleString()}</b>
                  <span className="text-xs text-ink-400">{ago(s.createdAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
