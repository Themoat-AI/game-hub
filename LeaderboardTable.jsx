import { Spinner } from './Spinner.jsx';

const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

/** Ranked list. `meName` highlights the signed-in player's row. */
export default function LeaderboardTable({ entries, loading, meName, unit = 'pts', empty = 'No scores yet — be the first!', compact = false }) {
  if (loading && !entries) {
    return (
      <div className="grid place-items-center py-10">
        <Spinner size={26} />
      </div>
    );
  }
  if (!entries?.length) return <p className="py-8 text-center text-sm text-ink-400">{empty}</p>;

  return (
    <ol className={`divide-y divide-ink-700/60 ${loading ? 'opacity-60 transition' : ''}`}>
      {entries.map((e) => {
        const me = meName && e.username === meName;
        return (
          <li
            key={e.userId}
            className={`flex items-center gap-3 ${compact ? 'py-2' : 'py-2.5'} ${me ? 'bg-neon-cyan/10 -mx-3 rounded-lg px-3' : ''}`}
          >
            <span className="w-8 text-center font-display text-sm text-ink-400">{MEDALS[e.rank] ?? `#${e.rank}`}</span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {e.username}
              {e.isGuest && <span className="ml-2 text-[10px] uppercase tracking-wider text-ink-400">guest</span>}
              {me && <span className="ml-2 text-[10px] uppercase tracking-wider text-neon-cyan">you</span>}
            </span>
            <span className="font-display text-sm font-bold tabular-nums text-neon-lime">
              {e.score.toLocaleString()}
              <span className="ml-1 text-[10px] font-normal text-ink-400">{unit}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
