import { Link } from 'react-router-dom';

export function GameArt({ game, className = '', iconClass = 'text-6xl' }) {
  const a = game.assets || {};
  return (
    <div
      className={`relative grid place-items-center overflow-hidden ${className}`}
      style={{ background: `linear-gradient(135deg, ${a.from || '#22f0ff'}, ${a.to || '#6d28d9'})` }}
    >
      <div className="absolute inset-0 opacity-30 [background:radial-gradient(circle_at_30%_20%,white,transparent_45%)]" />
      <span className={`relative drop-shadow-[0_6px_16px_rgba(0,0,0,0.45)] transition group-hover:scale-110 ${iconClass}`} aria-hidden>
        {a.icon || '🎮'}
      </span>
    </div>
  );
}

export default function GameCard({ game }) {
  return (
    <Link
      to={`/play/${game.slug}`}
      className="group panel flex flex-col overflow-hidden transition hover:-translate-y-1 hover:border-neon-cyan/60 hover:shadow-[0_8px_30px_rgba(34,240,255,0.15)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-cyan"
    >
      <GameArt game={game} className="h-32" />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-base font-bold leading-tight">{game.title}</h3>
          {game.multiplayer && (
            <span className="chip shrink-0 !border-neon-pink/50 !text-neon-pink">2P live</span>
          )}
        </div>
        <p className="line-clamp-2 text-sm text-ink-200/80">{game.assets?.tagline || game.description}</p>
        <div className="mt-auto flex items-center justify-between pt-1 text-xs text-ink-400">
          <span className="chip">{game.category}</span>
          <span>{game.plays.toLocaleString()} plays</span>
        </div>
      </div>
    </Link>
  );
}
