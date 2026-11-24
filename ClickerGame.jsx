import { useCallback, useEffect, useRef, useState } from 'react';
import { Spinner } from '../components/Spinner.jsx';
import { api } from '../lib/api.js';
import { sfx } from '../lib/sound.js';
import { isTyping } from './util.js';

const SLUG = 'clicker';
const LOCAL_KEY = 'gh_clicker_save';
const MAX_SCORE = 1_000_000_000; // matches the server-side cap
const OFFLINE_CAP_S = 8 * 3600;
const OFFLINE_EFFICIENCY = 0.5;

const UPGRADES = [
  { id: 'gloves', name: 'Cosmic Gloves', desc: '+1 stardust per click', base: 15, growth: 1.17, click: 1, icon: '🧤' },
  { id: 'drone', name: 'Dust Drone', desc: '+0.5 / sec', base: 40, growth: 1.15, dps: 0.5, icon: '🛸' },
  { id: 'rig', name: 'Nebula Rig', desc: '+4 / sec', base: 280, growth: 1.15, dps: 4, icon: '🔭' },
  { id: 'gauntlet', name: 'Titan Gauntlet', desc: '+10 per click', base: 1200, growth: 1.2, click: 10, icon: '🦾' },
  { id: 'collector', name: 'Star Collector', desc: '+25 / sec', base: 2600, growth: 1.15, dps: 25, icon: '🌟' },
  { id: 'reactor', name: 'Quasar Reactor', desc: '+150 / sec', base: 16000, growth: 1.15, dps: 150, icon: '⚛️' },
  { id: 'engine', name: 'Galaxy Engine', desc: '+1,000 / sec', base: 120000, growth: 1.15, dps: 1000, icon: '🌌' },
  { id: 'singularity', name: 'Singularity Farm', desc: '+8,000 / sec', base: 1_000_000, growth: 1.15, dps: 8000, icon: '🕳️' },
];

const fresh = () => ({ dust: 0, lifetime: 0, clicks: 0, owned: {}, savedAt: Date.now() });
const cost = (u, owned) => Math.ceil(u.base * Math.pow(u.growth, owned[u.id] || 0));

function derive(owned) {
  let click = 1;
  let dps = 0;
  for (const u of UPGRADES) {
    const n = owned[u.id] || 0;
    if (u.click) click += u.click * n;
    if (u.dps) dps += u.dps * n;
  }
  return { click, dps };
}

const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa'];
function fmt(n) {
  if (n < 1000) return n < 10 && n % 1 ? n.toFixed(1) : Math.floor(n).toLocaleString();
  const tier = Math.min(SUFFIX.length - 1, Math.floor(Math.log10(n) / 3));
  return `${(n / Math.pow(1000, tier)).toFixed(2)}${SUFFIX[tier]}`;
}

/** Defensive parse — saves come from localStorage or the server. */
function sanitize(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const num = (v) => (Number.isFinite(v) && v >= 0 ? v : 0);
  const owned = {};
  for (const u of UPGRADES) owned[u.id] = Math.min(10_000, Math.floor(num(raw.owned?.[u.id])));
  return { dust: num(raw.dust), lifetime: num(raw.lifetime), clicks: Math.floor(num(raw.clicks)), owned, savedAt: num(raw.savedAt) || Date.now() };
}

export default function ClickerGame({ host }) {
  const hostRef = useRef(host);
  hostRef.current = host;
  const userId = host.user?.id;

  const [s, setS] = useState(fresh);
  const sRef = useRef(s);
  sRef.current = s;
  const [loading, setLoading] = useState(true);
  const [savedAt, setSavedAt] = useState(null);
  const [floats, setFloats] = useState([]);
  const lastSubmitted = useRef(0);
  const floatId = useRef(0);
  const loaded = useRef(false);

  const { click, dps } = derive(s.owned);
  const clickRef = useRef(click);
  clickRef.current = click;
  const dpsRef = useRef(dps);
  dpsRef.current = dps;

  // ── persistence: server (when signed in) + localStorage mirror ────────────
  const persist = useCallback(async () => {
    if (!loaded.current) return;
    const data = { ...sRef.current, savedAt: Date.now() };
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
    } catch {
      /* ignore */
    }
    if (hostRef.current.isAuthed) {
      try {
        await api.putSave(SLUG, data);
        setSavedAt(Date.now());
      } catch {
        /* keep playing; the next autosave will retry */
      }
    } else {
      setSavedAt(Date.now());
    }
  }, []);

  // Load the newest of (server save, local save) and grant capped offline progress.
  useEffect(() => {
    let alive = true;
    (async () => {
      await persist(); // when the account changes mid-game, flush progress first (no-op on first load)
      loaded.current = false;
      setLoading(true);
      let local = null;
      try {
        local = sanitize(JSON.parse(localStorage.getItem(LOCAL_KEY)));
      } catch {
        /* ignore */
      }
      let remote = null;
      if (hostRef.current.isAuthed) {
        try {
          remote = sanitize((await api.getSave(SLUG)).save?.data);
        } catch {
          /* offline → fall back to local */
        }
      }
      if (!alive) return;
      let start = [local, remote].filter(Boolean).sort((a, b) => b.savedAt - a.savedAt)[0] ?? fresh();

      const away = Math.min(OFFLINE_CAP_S, (Date.now() - start.savedAt) / 1000);
      const rate = derive(start.owned).dps;
      if (away > 60 && rate > 0) {
        const gain = rate * away * OFFLINE_EFFICIENCY;
        start = { ...start, dust: start.dust + gain, lifetime: start.lifetime + gain };
        hostRef.current.toast.info(`Welcome back! Your drones gathered ${fmt(gain)} stardust while you were away.`);
      }
      lastSubmitted.current = Math.floor(start.lifetime);
      setS(start);
      loaded.current = true;
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [userId, persist]);

  // Passive income, 10 ticks per second
  useEffect(() => {
    let prev = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(1, (now - prev) / 1000);
      prev = now;
      if (!loaded.current || hostRef.current.paused || dpsRef.current <= 0) return;
      const gain = dpsRef.current * dt;
      setS((p) => ({ ...p, dust: p.dust + gain, lifetime: p.lifetime + gain }));
    }, 100);
    return () => clearInterval(id);
  }, []);

  // Autosave every 15 s; final save (+ best-effort score) when leaving.
  useEffect(() => {
    const id = setInterval(persist, 15000);
    const onHide = () => document.hidden && persist();
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onHide);
      persist();
      const life = Math.min(MAX_SCORE, Math.floor(sRef.current.lifetime));
      if (loaded.current && hostRef.current.isAuthed && life > lastSubmitted.current) {
        api.submitScore(SLUG, life).catch(() => {});
      }
    };
  }, [persist]);

  useEffect(() => {
    hostRef.current.setLiveScore(Math.floor(s.lifetime));
  }, [s.lifetime]);

  // ── actions ───────────────────────────────────────────────────────────────
  const doClick = useCallback((e) => {
    if (!loaded.current || hostRef.current.paused) return;
    const gain = clickRef.current;
    setS((p) => ({ ...p, dust: p.dust + gain, lifetime: p.lifetime + gain, clicks: p.clicks + 1 }));
    sfx.click();
    const rect = e?.currentTarget?.getBoundingClientRect?.();
    const x = rect && e.clientX ? e.clientX - rect.left : rect ? rect.width / 2 : 100;
    const y = rect && e.clientY ? e.clientY - rect.top : rect ? rect.height / 2 : 100;
    const id = ++floatId.current;
    setFloats((f) => [...f.slice(-10), { id, x: x + (Math.random() * 30 - 15), y, v: gain }]);
    setTimeout(() => setFloats((f) => f.filter((q) => q.id !== id)), 900);
  }, []);

  const buy = (u) => {
    if (hostRef.current.paused || sRef.current.dust < cost(u, sRef.current.owned)) return;
    sfx.buy();
    setS((p) => {
      const c = cost(u, p.owned);
      if (p.dust < c) return p; // re-check against the latest state
      return { ...p, dust: p.dust - c, owned: { ...p.owned, [u.id]: (p.owned[u.id] || 0) + 1 } };
    });
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== ' ' || isTyping(e) || e.target?.tagName === 'BUTTON') return;
      e.preventDefault();
      doClick(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doClick]);

  async function bank() {
    const life = Math.min(MAX_SCORE, Math.floor(s.lifetime));
    if (life <= 0) return;
    const res = await hostRef.current.submitScore(life);
    if (res) lastSubmitted.current = life;
    persist();
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-ink-400">
        <Spinner size={30} />
        <p className="text-sm">Loading your saved universe…</p>
      </div>
    );
  }

  return (
    <div className="grid w-full max-w-4xl gap-5 md:grid-cols-[1fr_1.1fr]">
      {/* Star + counters */}
      <div className="flex flex-col items-center gap-4">
        <div className="text-center">
          <p className="font-display text-4xl font-black tabular-nums text-neon-amber sm:text-5xl">{fmt(s.dust)}</p>
          <p className="text-xs uppercase tracking-[0.25em] text-ink-400">stardust</p>
          <p className="mt-1 text-sm text-ink-200">
            <b className="text-neon-cyan">{fmt(click)}</b> / click · <b className="text-neon-lime">{fmt(dps)}</b> / sec
          </p>
        </div>

        <button
          type="button"
          onClick={doClick}
          aria-label="Harvest stardust"
          className="group relative grid h-52 w-52 select-none place-items-center rounded-full outline-none transition active:scale-95 focus-visible:ring-4 focus-visible:ring-neon-cyan/50 sm:h-60 sm:w-60"
          style={{
            background: 'radial-gradient(circle at 35% 30%, #fff7c2, #fbbf24 35%, #ef4444 75%, #7f1d1d)',
            boxShadow: '0 0 60px rgba(251,191,36,.45), inset 0 -10px 30px rgba(0,0,0,.35)',
            touchAction: 'manipulation',
          }}
        >
          <span className="text-7xl drop-shadow-lg transition group-hover:scale-110" aria-hidden>
            ✨
          </span>
          {floats.map((f) => (
            <span
              key={f.id}
              className="pointer-events-none absolute animate-float-up font-display text-lg font-black text-white"
              style={{ left: f.x, top: f.y, textShadow: '0 0 8px #000' }}
            >
              +{fmt(f.v)}
            </span>
          ))}
        </button>

        <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-ink-400">
          <span>
            Lifetime <b className="text-ink-100">{fmt(s.lifetime)}</b>
          </span>
          <span>·</span>
          <span>
            {s.clicks.toLocaleString()} clicks
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button className="btn-primary" onClick={bank} disabled={s.lifetime < 1}>
            🏆 Submit lifetime score
          </button>
          <button className="btn-ghost" onClick={persist}>
            💾 Save
          </button>
        </div>
        <p className="text-xs text-ink-400">
          {savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString()}` : 'Autosaves every 15 s'}
          {host.isAuthed ? ' · synced to your account' : ' · on this device (sign in to sync)'}
        </p>
      </div>

      {/* Upgrades */}
      <div className="thin-scroll max-h-[28rem] space-y-2 overflow-y-auto pr-1">
        {UPGRADES.map((u) => {
          const c = cost(u, s.owned);
          const can = s.dust >= c;
          return (
            <button
              key={u.id}
              onClick={() => buy(u)}
              disabled={!can}
              className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition
                ${can ? 'border-neon-lime/50 bg-ink-800 hover:bg-ink-700 active:scale-[0.99]' : 'border-ink-700 bg-ink-900/60 opacity-60'}`}
            >
              <span className="text-2xl" aria-hidden>
                {u.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">
                  {u.name} <span className="font-display text-xs text-ink-400">×{s.owned[u.id] || 0}</span>
                </span>
                <span className="block text-xs text-ink-200/80">{u.desc}</span>
              </span>
              <span className={`shrink-0 font-display text-sm font-bold tabular-nums ${can ? 'text-neon-amber' : 'text-ink-400'}`}>
                ✨ {fmt(c)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
