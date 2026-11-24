import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Spinner } from '../components/Spinner.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

export default function LoginPage() {
  const { user, isGuest, login, register, guest } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const mode = params.get('mode') === 'register' ? 'register' : 'login';
  const from = location.state?.from || '/';

  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Already signed in (and not upgrading a guest) → nothing to do here.
  if (user && !(isGuest && mode === 'register')) return <Navigate to={from} replace />;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'register') {
        const u = await register(form.username.trim(), form.email.trim(), form.password);
        toast.success(`Welcome aboard, ${u.username}!`);
      } else {
        const u = await login(form.username.trim(), form.password);
        toast.success(`Welcome back, ${u.username}!`);
      }
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function playAsGuest() {
    setBusy(true);
    try {
      await guest();
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md pt-4 sm:pt-10">
      <div className="panel p-6 sm:p-8">
        <div className="mb-6 grid grid-cols-2 rounded-xl border border-ink-600 bg-ink-900/70 p-1 text-sm font-semibold">
          {['login', 'register'].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setError('');
                setParams(m === 'register' ? { mode: 'register' } : {});
              }}
              className={`rounded-lg py-2 transition ${mode === m ? 'bg-neon-cyan text-ink-950' : 'text-ink-200 hover:text-white'}`}
            >
              {m === 'login' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>

        {isGuest && mode === 'register' && (
          <p className="mb-4 rounded-lg border border-neon-amber/40 bg-neon-amber/10 p-3 text-xs text-neon-amber">
            You’re signed in as a guest — your scores and saves will move to your new account.
          </p>
        )}

        <form onSubmit={submit} className="space-y-4" noValidate>
          <div>
            <label className="label" htmlFor="username">
              {mode === 'login' ? 'Username or email' : 'Username'}
            </label>
            <input
              id="username"
              className="input"
              autoComplete="username"
              required
              minLength={mode === 'register' ? 3 : 1}
              maxLength={mode === 'register' ? 20 : 254}
              value={form.username}
              onChange={set('username')}
              placeholder={mode === 'login' ? 'player1' : '3–20 letters, numbers, _ or -'}
            />
          </div>
          {mode === 'register' && (
            <div>
              <label className="label" htmlFor="email">
                Email <span className="normal-case text-ink-500">(optional)</span>
              </label>
              <input id="email" type="email" className="input" autoComplete="email" value={form.email} onChange={set('email')} placeholder="you@example.com" />
            </div>
          )}
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="input"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={mode === 'register' ? 8 : 1}
              maxLength={72}
              value={form.password}
              onChange={set('password')}
              placeholder={mode === 'register' ? 'At least 8 characters' : '••••••••'}
            />
          </div>

          {error && (
            <p role="alert" className="rounded-lg border border-neon-pink/50 bg-neon-pink/10 px-3 py-2 text-sm text-neon-pink">
              {error}
            </p>
          )}

          <button className="btn-primary w-full !py-3" disabled={busy}>
            {busy && <Spinner size={16} />}
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        {!user && (
          <>
            <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wider text-ink-500">
              <span className="h-px flex-1 bg-ink-700" /> or <span className="h-px flex-1 bg-ink-700" />
            </div>
            <button className="btn-ghost w-full" onClick={playAsGuest} disabled={busy}>
              Continue as guest
            </button>
          </>
        )}
      </div>
      <p className="mt-4 text-center text-xs text-ink-400">
        <Link to="/" className="hover:text-neon-cyan">
          ← Back to games
        </Link>
      </p>
    </div>
  );
}
