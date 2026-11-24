import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useLocation, useNavigate } from 'react-router-dom';
import { API_BASE, getToken } from '../lib/api.js';
import { useAuth } from './AuthContext.jsx';
import { useToast } from './ToastContext.jsx';

const SocketContext = createContext({ socket: null, connected: false, activeMatch: null, clearMatch: () => {} });

/**
 * One Socket.io connection per signed-in user. It also tracks the player's active
 * match: when the server pairs you (or resumes a match after a reconnect) we jump
 * straight to that game's page.
 */
export function SocketProvider({ children }) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  // `navigate` changes identity on every route change in a non-data router; keep it in a
  // ref so navigating around never tears down the socket.
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [activeMatch, setActiveMatch] = useState(null);
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    const s = io(API_BASE || undefined, {
      auth: (cb) => cb({ token: getToken() }), // re-read on every reconnect
      transports: ['websocket', 'polling'],
      reconnectionDelayMax: 4000,
    });

    const goToMatch = (m) => {
      setActiveMatch({ matchId: m.matchId, game: m.game });
      const target = `/play/${m.game}`;
      if (pathRef.current !== target) navigateRef.current(target);
    };

    let wasDown = false;
    s.on('connect', () => {
      setConnected(true);
      if (wasDown) toast.success('Reconnected');
      wasDown = false;
    });
    s.on('disconnect', (reason) => {
      setConnected(false);
      if (reason !== 'io client disconnect') {
        wasDown = true;
        toast.error('Connection lost — trying to reconnect…', { duration: 3000 });
      }
    });
    s.on('connect_error', (err) => {
      if (err.message === 'AUTH_INVALID' || err.message === 'AUTH_REQUIRED') s.disconnect();
    });
    s.on('match:found', (m) => {
      toast.info('Opponent found!');
      goToMatch(m);
    });
    s.on('match:resume', goToMatch);

    setSocket(s);
    return () => {
      s.removeAllListeners();
      s.disconnect();
      setSocket(null);
      setConnected(false);
      setActiveMatch(null);
    };
  }, [userId, toast]);

  const clearMatch = useCallback(() => setActiveMatch(null), []);
  const value = useMemo(() => ({ socket, connected, activeMatch, clearMatch }), [socket, connected, activeMatch, clearMatch]);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export const useSocket = () => useContext(SocketContext);
