import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from '../context/SocketContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

/**
 * Client side of the server's match protocol (see server/src/sockets/matches.js).
 *
 * phase: 'idle' → 'queued' | 'room' → 'playing' → 'over'
 *
 * The socket layer (SocketContext) navigates to the game page and exposes
 * `activeMatch` whenever the server pairs us or resumes a match after a refresh;
 * this hook then `match:sync`s to fetch the full current state.
 */
export function useMatch(slug, { onOver } = {}) {
  const { socket, connected, activeMatch, clearMatch } = useSocket();
  const toast = useToast();

  const [phase, setPhase] = useState('idle');
  const [info, setInfo] = useState(null); // { matchId, you, players, config }
  const [state, setState] = useState(null);
  const [over, setOver] = useState(null);
  const [opponent, setOpponent] = useState(null); // { status: 'disconnected' | 'left', graceMs }
  const [rematchFrom, setRematchFrom] = useState(null);
  const [roomCode, setRoomCode] = useState(null);

  const snapRef = useRef({ state: null, at: 0 }); // latest snapshot, for smooth canvas rendering
  const matchIdRef = useRef(null);
  const phaseRef = useRef('idle');
  phaseRef.current = phase;
  const onOverRef = useRef(onOver);
  onOverRef.current = onOver;

  const attach = useCallback((res) => {
    matchIdRef.current = res.matchId;
    snapRef.current = { state: res.state, at: performance.now() };
    setInfo({ matchId: res.matchId, you: res.you, players: res.players, config: res.config });
    setState(res.state);
    setOpponent(null);
    setRematchFrom(null);
    setRoomCode(null);
    if (res.over) {
      setOver(res.over);
      setPhase('over');
    } else {
      setOver(null);
      setPhase('playing');
    }
  }, []);

  // A match exists for this game → fetch its state.
  useEffect(() => {
    if (!socket || !connected || !activeMatch || activeMatch.game !== slug) return;
    socket.emit('match:sync', { matchId: activeMatch.matchId }, (res) => {
      if (res?.ok) attach(res);
      else {
        clearMatch();
        setPhase('idle');
      }
    });
  }, [socket, connected, activeMatch, slug, attach, clearMatch]);

  // Live events
  useEffect(() => {
    if (!socket) return;
    const mine = (m) => m.matchId === matchIdRef.current;
    const onWaiting = (m) => m.game === slug && setPhase('queued');
    const onState = (m) => {
      if (!mine(m)) return;
      snapRef.current = { state: m.state, at: performance.now() };
      setState(m.state);
    };
    const onMatchOver = (m) => {
      if (!mine(m)) return;
      setOver(m);
      setPhase('over');
      onOverRef.current?.(m);
    };
    const onOpponent = (m) => mine(m) && setOpponent(m.status === 'reconnected' ? null : m);
    const onRematch = (m) => mine(m) && setRematchFrom(m.from);

    socket.on('queue:waiting', onWaiting);
    socket.on('match:state', onState);
    socket.on('match:over', onMatchOver);
    socket.on('match:opponent', onOpponent);
    socket.on('match:rematch', onRematch);
    return () => {
      socket.off('queue:waiting', onWaiting);
      socket.off('match:state', onState);
      socket.off('match:over', onMatchOver);
      socket.off('match:opponent', onOpponent);
      socket.off('match:rematch', onRematch);
    };
  }, [socket, slug]);

  // Leaving the page: drop out of queues/rooms; forfeit a match in progress.
  // (Deferred a tick so React StrictMode's simulated unmount doesn't trigger it.)
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      setTimeout(() => {
        if (mounted.current || !socket) return;
        if (phaseRef.current === 'queued' || phaseRef.current === 'room') {
          socket.emit('queue:leave');
          socket.emit('room:cancel');
        }
        if (matchIdRef.current) {
          socket.emit('match:leave', { matchId: matchIdRef.current });
          matchIdRef.current = null;
          clearMatch();
        }
      }, 50);
    };
  }, [socket, clearMatch]);

  // ── actions ────────────────────────────────────────────────────────────────
  const findMatch = useCallback(() => {
    socket?.emit('queue:join', { game: slug }, (res) => {
      if (res?.status === 'waiting') setPhase('queued');
      else if (!res?.ok && res?.code !== 'IN_MATCH') toast.error(res?.error || 'Could not join the queue');
    });
  }, [socket, slug, toast]);

  const cancel = useCallback(() => {
    socket?.emit('queue:leave');
    socket?.emit('room:cancel');
    setRoomCode(null);
    setPhase('idle');
  }, [socket]);

  const createRoom = useCallback(() => {
    socket?.emit('room:create', { game: slug }, (res) => {
      if (res?.ok) {
        setRoomCode(res.code);
        setPhase('room');
      } else toast.error(res?.error || 'Could not create a room');
    });
  }, [socket, slug, toast]);

  const joinRoom = useCallback(
    (code) => {
      socket?.emit('room:join', { code }, (res) => {
        if (!res?.ok) toast.error(res?.error || 'Could not join that room');
      });
    },
    [socket, toast],
  );

  const act = useCallback(
    (action, cb) => socket?.emit('match:action', { matchId: matchIdRef.current, action }, cb),
    [socket],
  );

  const rematch = useCallback(() => {
    socket?.emit('match:rematch', { matchId: matchIdRef.current }, (res) => {
      if (!res?.ok) toast.error(res?.error || 'Rematch unavailable');
    });
  }, [socket, toast]);

  /** Leave the match (forfeits if still playing) and return to the lobby screen. */
  const leave = useCallback(() => {
    if (matchIdRef.current) socket?.emit('match:leave', { matchId: matchIdRef.current });
    matchIdRef.current = null;
    clearMatch();
    setInfo(null);
    setState(null);
    setOver(null);
    setOpponent(null);
    setRematchFrom(null);
    setPhase('idle');
  }, [socket, clearMatch]);

  return {
    connected,
    phase,
    info,
    state,
    snapRef,
    over,
    opponent,
    rematchFrom,
    roomCode,
    findMatch,
    cancel,
    createRoom,
    joinRoom,
    act,
    rematch,
    leave,
  };
}
