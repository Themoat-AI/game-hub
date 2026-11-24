import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Spinner } from './Spinner.jsx';

/** Pre-game screen for multiplayer games: quick match, private room, join by code. */
export default function MatchLobby({ title, blurb, phase, roomCode, connected, onFind, onCancel, onCreateRoom, onJoinRoom }) {
  const { isAuthed, guest } = useAuth();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function playAsGuest() {
    setBusy(true);
    try {
      await guest();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!isAuthed) {
    return (
      <div className="mx-auto max-w-md text-center">
        <div className="mb-3 text-5xl">🎮</div>
        <h2 className="font-display text-xl font-bold">Sign in to play {title} online</h2>
        <p className="mt-2 text-sm text-ink-200">Multiplayer needs a player name. Guests get one instantly — no password.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <button className="btn-primary" onClick={playAsGuest} disabled={busy}>
            {busy && <Spinner size={14} />} Play as guest
          </button>
          <Link to="/login" className="btn-ghost">
            Sign in / Sign up
          </Link>
        </div>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-ink-400">
        <Spinner size={30} />
        <p className="text-sm">Connecting to the game server…</p>
      </div>
    );
  }

  if (phase === 'queued') {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <Spinner size={44} />
        <h2 className="font-display text-lg font-bold">Searching for an opponent…</h2>
        <p className="text-sm text-ink-400">Open this page in a second browser or tab (as a different player) to test locally.</p>
        <button className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    );
  }

  if (phase === 'room') {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <p className="text-sm text-ink-400">Share this code with a friend</p>
        <button
          className="rounded-2xl border border-neon-cyan/50 bg-ink-900 px-8 py-4 font-display text-4xl font-black tracking-[0.4em] text-neon-cyan hover:bg-ink-800"
          title="Click to copy"
          onClick={() => navigator.clipboard?.writeText(roomCode).then(() => toast.success('Code copied'), () => {})}
        >
          {roomCode}
        </button>
        <div className="flex items-center gap-2 text-sm text-ink-400">
          <Spinner size={14} /> Waiting for your friend to join…
        </div>
        <button className="btn-ghost" onClick={onCancel}>
          Cancel room
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-5">
      <div className="text-center">
        <h2 className="font-display text-xl font-bold">{title}</h2>
        <p className="mt-1 text-sm text-ink-200">{blurb}</p>
      </div>
      <button className="btn-primary w-full !py-3 text-base" onClick={onFind}>
        ⚡ Quick match
      </button>
      <div className="grid gap-3 sm:grid-cols-2">
        <button className="btn-ghost !py-3" onClick={onCreateRoom}>
          Create private room
        </button>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) onJoinRoom(code.trim());
          }}
        >
          <input
            className="input !py-2.5 text-center font-display uppercase tracking-[0.3em]"
            placeholder="CODE"
            maxLength={5}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            aria-label="Room code"
          />
          <button className="btn-ghost" disabled={code.trim().length < 5}>
            Join
          </button>
        </form>
      </div>
    </div>
  );
}
