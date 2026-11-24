import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import FeaturedBanner from '../components/FeaturedBanner.jsx';
import GameCard from '../components/GameCard.jsx';
import LeaderboardTable from '../components/LeaderboardTable.jsx';
import LobbyChat from '../components/LobbyChat.jsx';
import { Spinner } from '../components/Spinner.jsx';
import StatsPanel from '../components/StatsPanel.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';

export default function HubPage() {
  const { user } = useAuth();
  const [featured, setFeatured] = useState([]);
  const [tabs, setTabs] = useState(['All', 'Multiplayer']);
  const [tab, setTab] = useState('All');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState(''); // debounced search
  const [sort, setSort] = useState('default');
  const [games, setGames] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [top, setTop] = useState(null);
  const [reload, setReload] = useState(0);

  // One-off data: featured banner, category tabs, global top 5.
  useEffect(() => {
    const ctrl = new AbortController();
    api.featured(ctrl.signal).then((r) => setFeatured(r.games)).catch(() => {});
    api
      .categories(ctrl.signal)
      .then((r) => setTabs(['All', ...r.categories.map((c) => c.name), 'Multiplayer']))
      .catch(() => {});
    api.leaderboard(5, ctrl.signal).then((r) => setTop(r.entries)).catch(() => setTop([]));
    return () => ctrl.abort();
  }, []);

  // Debounce the search box so we don't hit the API on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(id);
  }, [search]);

  // Game grid: server-side search / category / sort.
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    api
      .games(
        {
          search: query,
          sort,
          category: tab !== 'All' && tab !== 'Multiplayer' ? tab : undefined,
          multiplayer: tab === 'Multiplayer' ? 'true' : undefined,
        },
        ctrl.signal,
      )
      .then((r) => {
        setGames(r.games);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err.message);
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [query, tab, sort, reload]);

  const clearFilters = useCallback(() => {
    setSearch('');
    setTab('All');
    setSort('default');
  }, []);

  return (
    <div className="space-y-8">
      <FeaturedBanner games={featured} />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section aria-label="Games" className="min-w-0 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400">⌕</span>
              <input
                type="search"
                className="input !pl-9"
                placeholder="Search games, tags…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search games"
              />
            </div>
            <select className="input sm:!w-44" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort games">
              <option value="default">Featured order</option>
              <option value="popular">Most played</option>
              <option value="newest">Newest</option>
              <option value="title">A → Z</option>
            </select>
          </div>

          <div role="tablist" aria-label="Categories" className="thin-scroll flex gap-2 overflow-x-auto pb-1">
            {tabs.map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                  tab === t
                    ? 'border-neon-cyan bg-neon-cyan/15 text-neon-cyan'
                    : 'border-ink-600 bg-ink-800/60 text-ink-200 hover:border-ink-400'
                }`}
              >
                {t === 'Multiplayer' ? '⚡ Multiplayer' : t}
              </button>
            ))}
            {loading && games && <Spinner size={16} className="ml-1 self-center" />}
          </div>

          {error ? (
            <div className="panel p-8 text-center">
              <p className="text-neon-pink">{error}</p>
              <button className="btn-primary mt-4" onClick={() => setReload((n) => n + 1)}>
                Retry
              </button>
            </div>
          ) : !games ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="panel h-60 animate-pulse" />
              ))}
            </div>
          ) : games.length === 0 ? (
            <div className="panel p-10 text-center">
              <div className="mb-2 text-4xl">🕹️</div>
              <p className="font-semibold">No games match your filters.</p>
              <button className="btn-ghost mt-4" onClick={clearFilters}>
                Clear filters
              </button>
            </div>
          ) : (
            <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 ${loading ? 'opacity-70 transition' : ''}`}>
              {games.map((g) => (
                <GameCard key={g.slug} game={g} />
              ))}
            </div>
          )}
        </section>

        <aside className="min-w-0 space-y-5">
          <StatsPanel />
          <div className="panel p-5">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-display text-sm font-bold uppercase tracking-wider text-neon-amber">Top players</h3>
              <Link to="/leaderboard" className="text-xs text-ink-400 hover:text-neon-cyan">
                View all →
              </Link>
            </div>
            <LeaderboardTable entries={top} loading={!top} meName={user?.username} compact />
          </div>
          <LobbyChat room="global" title="Global lobby" />
        </aside>
      </div>
    </div>
  );
}
