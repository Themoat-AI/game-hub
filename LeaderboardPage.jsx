import { useEffect, useState } from 'react';
import LeaderboardTable from '../components/LeaderboardTable.jsx';
import { Spinner } from '../components/Spinner.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [games, setGames] = useState([]);
  const [scope, setScope] = useState('global');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.games().then((r) => setGames(r.games)).catch(() => {});
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    const req = scope === 'global' ? api.leaderboard(50, ctrl.signal) : api.gameBoard(scope, 50, ctrl.signal);
    req
      .then((r) => {
        setData(r);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err.message);
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [scope, user?.id]);

  const tabs = [{ slug: 'global', title: '🏆 Global' }, ...games.map((g) => ({ slug: g.slug, title: `${g.assets?.icon ?? ''} ${g.title}` }))];
  const unit = scope === 'global' || data?.scoring === 'total' ? 'pts' : '';

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="font-display text-3xl font-black tracking-tight">Leaderboards</h1>
        <p className="mt-1 text-sm text-ink-200">
          {scope === 'global'
            ? 'Hub points: your best score in each arcade game plus everything you’ve earned in multiplayer.'
            : data?.scoring === 'total'
              ? 'Ranked by total points earned across all matches.'
              : 'Ranked by best single score.'}
        </p>
      </header>

      <div role="tablist" className="thin-scroll flex gap-2 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.slug}
            role="tab"
            aria-selected={scope === t.slug}
            onClick={() => setScope(t.slug)}
            className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition ${
              scope === t.slug ? 'border-neon-cyan bg-neon-cyan/15 text-neon-cyan' : 'border-ink-600 bg-ink-800/60 text-ink-200 hover:border-ink-400'
            }`}
          >
            {t.title}
          </button>
        ))}
      </div>

      <div className="panel p-5">
        {error ? (
          <p className="py-8 text-center text-neon-pink">{error}</p>
        ) : (
          <>
            {loading && data && <Spinner size={14} className="float-right" />}
            <LeaderboardTable entries={data?.entries} loading={loading} meName={user?.username} unit={unit} />
          </>
        )}
      </div>
      {scope !== 'global' && data?.me && (
        <p className="text-center text-sm text-ink-200">
          Your standing: <b className="text-neon-lime">{data.me.score.toLocaleString()}</b> · rank #{data.me.rank}
        </p>
      )}
    </div>
  );
}
