import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

/** Rotating hero for featured games (pauses on hover/focus). */
export default function FeaturedBanner({ games }) {
  const [i, setI] = useState(0);
  const [hold, setHold] = useState(false);

  useEffect(() => {
    if (games.length < 2 || hold) return;
    const id = setInterval(() => setI((n) => (n + 1) % games.length), 6000);
    return () => clearInterval(id);
  }, [games.length, hold]);

  if (!games.length) return null;
  const game = games[i % games.length];
  const a = game.assets || {};

  return (
    <section
      aria-label="Featured game"
      onMouseEnter={() => setHold(true)}
      onMouseLeave={() => setHold(false)}
      onFocus={() => setHold(true)}
      onBlur={() => setHold(false)}
      className="relative overflow-hidden rounded-3xl border border-ink-600/60"
      style={{ background: `linear-gradient(120deg, ${a.from}33, ${a.to}55 60%, #06050d)` }}
    >
      <div className="absolute -right-6 -top-10 select-none text-[11rem] leading-none opacity-20 sm:text-[16rem]" aria-hidden>
        {a.icon}
      </div>
      <div className="relative flex min-h-[220px] flex-col justify-end gap-3 p-6 sm:min-h-[260px] sm:p-10">
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip !border-neon-amber/60 !text-neon-amber">★ Featured</span>
          <span className="chip">{game.category}</span>
          {game.multiplayer && <span className="chip !border-neon-pink/50 !text-neon-pink">Real-time multiplayer</span>}
        </div>
        <h2 className="font-display text-3xl font-black tracking-tight sm:text-5xl">{game.title}</h2>
        <p className="max-w-xl text-sm text-ink-100/80 sm:text-base">{game.description}</p>
        <div className="mt-2 flex items-center gap-4">
          <Link to={`/play/${game.slug}`} className="btn-primary !px-6 !py-3 text-base">
            ▶ Play now
          </Link>
          {games.length > 1 && (
            <div className="flex gap-1.5" role="tablist" aria-label="Featured games">
              {games.map((g, idx) => (
                <button
                  key={g.slug}
                  role="tab"
                  aria-selected={idx === i}
                  aria-label={g.title}
                  onClick={() => setI(idx)}
                  className={`h-2 rounded-full transition-all ${idx === i ? 'w-7 bg-neon-cyan' : 'w-2 bg-ink-500 hover:bg-ink-400'}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
