import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ExternalGame from '../components/ExternalGame.jsx';
import GameFrame from '../components/GameFrame.jsx';
import LeaderboardTable from '../components/LeaderboardTable.jsx';
import LobbyChat from '../components/LobbyChat.jsx';
import { PageLoader, Spinner } from '../components/Spinner.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { BUILTIN_GAMES } from '../games/registry.js';
import { api } from '../lib/api.js';
import { isMuted, setMuted, subscribeMuted } from '../lib/sound.js';

export default function GamePage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, isAuthed, refreshStats } = useAuth();

  const [game, setGame] = useState(null);
  const [error, setError] = useState(null);
  const [paused, setPaused] = useState(false);
  const [muted, setMutedState] = useState(isMuted());
  const [liveScore, setLiveScore] = useState(null);
  const [board, setBoard] = useState(null);
  const [boardLoading, setBoardLoading] = useState(false);

  // ── load the game's metadata ──────────────────────────────────────────────
  useEffect(() => {
    const ctrl = new AbortController();
    setGame(null);
    setError(null);
    setPaused(false);
    setLiveScore(null);
    setBoard(null);
    api
      .game(slug, ctrl.signal)
      .then((r) => setGame(r.game))
      .catch((err) => err.name !== 'AbortError' && setError(err));
    return () => ctrl.abort();
  }, [slug]);

  // ── leaderboard (refreshed after every score / finished match) ────────────
  const refreshBoard = useCallback(async () => {
    setBoardLoading(true);
    try {
      setBoard(await api.gameBoard(slug, 10));
    } catch {
      setBoard((b) => b ?? { entries: [], scoring: 'best' });
    } finally {
      setBoardLoading(false);
    }
  }, [slug]);
  useEffect(() => {
    refreshBoard();
  }, [refreshBoard, user?.id]);

  // ── count a play for single-player games ──────────────────────────────────
  const countedFor = useRef('');
  useEffect(() => {
    if (!game || game.multiplayer || !isAuthed) return;
    const key = `${game.slug}:${user.id}`;
    if (countedFor.current === key) return;
    countedFor.current = key;
    api.play(game.slug).then(refreshStats).catch(() => {});
  }, [game, isAuthed, user?.id, refreshStats]);

  // ── global controls: sound, pause (button, P key, tab hidden) ─────────────
  useEffect(() => subscribeMuted(setMutedState), []);
  const canPause = Boolean(game) && !game.multiplayer;
  const togglePause = useCallback(() => canPause && setPaused((p) => !p), [canPause]);
  useEffect(() => {
    if (!canPause) return;
    const onKey = (e) => {
      if (e.key.toLowerCase() === 'p' && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) setPaused((p) => !p);
    };
    const onHidden = () => document.hidden && setPaused(true);
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [canPause]);

  // ── score submission shared by every game ─────────────────────────────────
  const submitScore = useCallback(
    async (score, meta) => {
      if (!isAuthed) {
        toast.info('Sign in or play as guest to save scores to the leaderboard.', {
          action: { label: 'Sign in', onClick: () => navigate('/login') },
          duration: 6000,
        });
        return null;
      }
      try {
        const res = await api.submitScore(slug, score, meta);
        if (res.isPersonalBest) toast.success(`New personal best: ${score.toLocaleString()} — rank #${res.standing.rank}`);
        else toast.info(`Score saved — you're ranked #${res.standing.rank} (best ${res.standing.score.toLocaleString()})`);
        refreshBoard();
        refreshStats();
        return res;
      } catch (err) {
        toast.error(err.message);
        return null;
      }
    },
    [isAuthed, slug, toast, navigate, refreshBoard, refreshStats],
  );

  // Multiplayer results are written by the server; just refresh what the UI shows.
  const matchFinished = useCallback(() => {
    refreshBoard();
    refreshStats();
  }, [refreshBoard, refreshStats]);

  // The object every game component receives.
  const host = useMemo(
    () => (game ? { game, paused, muted, isAuthed, user, submitScore, setLiveScore, matchFinished, toast } : null),
    [game, paused, muted, isAuthed, user, submitScore, matchFinished, toast],
  );

  if (error) {
    return (
      <div className="panel mx-auto mt-8 max-w-md p-8 text-center">
        <div className="mb-2 text-4xl">👾</div>
        <h2 className="font-display text-lg font-bold">{error.status === 404 ? 'Game not found' : 'Could not load game'}</h2>
        <p className="mt-2 text-sm text-ink-200">{error.message}</p>
        <Link to="/" className="btn-primary mt-5">
          Back to games
        </Link>
      </div>
    );
  }
  if (!game) return <PageLoader label="Loading game…" />;

  const Builtin = game.type === 'builtin' ? BUILTIN_GAMES[game.slug] : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-5">
        <Link to="/" className="inline-block text-sm text-ink-400 hover:text-neon-cyan">
          ← All games
        </Link>

        <GameFrame
          game={game}
          paused={paused}
          muted={muted}
          canPause={canPause}
          onTogglePause={togglePause}
          onToggleMute={() => setMuted(!muted)}
          liveScore={liveScore}
        >
          {({ fullscreen }) =>
            game.type === 'external' ? (
              <ExternalGame host={host} fullscreen={fullscreen} />
            ) : Builtin ? (
              <Suspense fallback={<Spinner size={32} />}>
                <Builtin host={host} fullscreen={fullscreen} />
              </Suspense>
            ) : (
              <p className="text-ink-400">This game isn’t installed on the client yet.</p>
            )
          }
        </GameFrame>

        <div className="panel p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip">{game.category}</span>
            {game.multiplayer && <span className="chip !border-neon-pink/50 !text-neon-pink">2-player live</span>}
            {game.type === 'external' && <span className="chip !border-neon-amber/50 !text-neon-amber">embedded</span>}
          </div>
          <p className="mt-3 text-sm leading-relaxed text-ink-200">{game.description}</p>
          {game.assets?.controls && (
            <p className="mt-3 text-sm">
              <span className="text-ink-400">Controls: </span>
              {game.assets.controls}
              {canPause && <span className="text-ink-400"> · P to pause</span>}
            </p>
          )}
        </div>
      </div>

      <aside className="min-w-0 space-y-5">
        <div className="panel p-5">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="font-display text-sm font-bold uppercase tracking-wider text-neon-amber">Leaderboard</h3>
            {boardLoading && <Spinner size={14} />}
          </div>
          <p className="mb-2 text-xs text-ink-400">
            {board?.scoring === 'total' ? 'Ranked by total points earned.' : 'Ranked by best score.'}
          </p>
          <LeaderboardTable
            entries={board?.entries}
            loading={boardLoading}
            meName={user?.username}
            unit={board?.scoring === 'total' ? 'pts' : ''}
            compact
          />
          {board?.me && !board.entries.some((e) => e.username === user?.username) && (
            <p className="mt-2 border-t border-ink-700 pt-2 text-center text-xs text-ink-200">
              You: <b className="text-neon-lime">{board.me.score.toLocaleString()}</b> · rank #{board.me.rank}
            </p>
          )}
        </div>
        {game.multiplayer && <LobbyChat room={game.slug} title={`${game.title} lobby`} />}
      </aside>
    </div>
  );
}
