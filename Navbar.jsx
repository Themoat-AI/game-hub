import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Spinner } from './Spinner.jsx';

const linkClass = ({ isActive }) =>
  `rounded-lg px-3 py-1.5 text-sm font-medium transition ${isActive ? 'bg-ink-700 text-neon-cyan' : 'text-ink-200 hover:bg-ink-800 hover:text-white'}`;

export default function Navbar() {
  const { user, isAuthed, isGuest, guest, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function playAsGuest() {
    setBusy(true);
    try {
      const u = await guest();
      toast.success(`Welcome, ${u.username}! Your scores are saved on this device — create an account to keep them.`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-ink-700/60 bg-ink-950/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:gap-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 font-display text-base font-extrabold tracking-tight sm:text-lg">
          <img src="/favicon.svg" alt="" className="h-7 w-7" />
          <span>
            GAME<span className="text-neon-pink">/</span>
            <span className="text-neon-cyan">HUB</span>
          </span>
        </Link>

        <nav className="ml-1 flex items-center gap-1 sm:ml-4">
          <NavLink to="/" end className={linkClass}>
            Games
          </NavLink>
          <NavLink to="/leaderboard" className={linkClass}>
            Leaderboard
          </NavLink>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {isAuthed ? (
            <>
              <button
                onClick={() => navigate('/profile')}
                className="flex items-center gap-2 rounded-xl border border-ink-600 bg-ink-800/70 px-3 py-1.5 text-sm hover:border-ink-400"
                title="Your profile"
              >
                <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-neon-cyan to-neon-pink font-display text-xs font-bold text-ink-950">
                  {user.username[0].toUpperCase()}
                </span>
                <span className="hidden max-w-[9rem] truncate sm:block">{user.username}</span>
                {isGuest && <span className="chip hidden sm:inline-flex">guest</span>}
              </button>
              {isGuest && (
                <Link to="/login?mode=register" className="btn-primary hidden !py-1.5 md:inline-flex">
                  Save progress
                </Link>
              )}
              <button className="btn-ghost !py-1.5" onClick={logout}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <button className="btn-ghost !py-1.5" onClick={playAsGuest} disabled={busy}>
                {busy && <Spinner size={14} />}
                <span className="hidden sm:inline">Play as guest</span>
                <span className="sm:hidden">Guest</span>
              </button>
              <Link to="/login" className="btn-primary !py-1.5">
                Sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
