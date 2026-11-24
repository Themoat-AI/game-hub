import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

/** Live lobby chat + presence for a room ("global" or a multiplayer game slug). */
export default function LobbyChat({ room = 'global', title = 'Lobby chat' }) {
  const { socket, connected } = useSocket();
  const { user, isAuthed } = useAuth();
  const toast = useToast();
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [text, setText] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    if (!socket || !connected) return;
    let alive = true;
    socket.emit('lobby:join', { room }, (res) => {
      if (alive && res?.ok) setMessages(res.history);
    });
    const onMessage = (m) => m.room === room && setMessages((list) => [...list.slice(-99), m]);
    const onPresence = (p) => p.room === room && setUsers(p.users);
    socket.on('chat:message', onMessage);
    socket.on('lobby:presence', onPresence);
    return () => {
      alive = false;
      socket.off('chat:message', onMessage);
      socket.off('lobby:presence', onPresence);
      socket.emit('lobby:leave', { room });
    };
  }, [socket, connected, room]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function send(e) {
    e.preventDefault();
    const value = text.trim();
    if (!value || !socket) return;
    socket.emit('chat:send', { room, text: value }, (res) => {
      if (!res?.ok) toast.error(res?.error || 'Message failed to send');
    });
    setText('');
  }

  return (
    <div className="panel flex h-80 flex-col p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-display text-sm font-bold uppercase tracking-wider text-neon-pink">{title}</h3>
        <span className="flex items-center gap-1.5 text-xs text-ink-400" title={users.map((u) => u.username).join(', ')}>
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-neon-lime' : 'bg-ink-500'}`} />
          {connected ? `${users.length} online` : 'offline'}
        </span>
      </div>

      {!isAuthed ? (
        <div className="grid flex-1 place-items-center text-center text-sm text-ink-400">
          <p>
            <Link to="/login" className="text-neon-cyan underline">
              Sign in
            </Link>{' '}
            (or play as guest) to chat.
          </p>
        </div>
      ) : (
        <>
          <div ref={listRef} className="thin-scroll flex-1 space-y-1.5 overflow-y-auto pr-1 text-sm">
            {messages.length === 0 && <p className="pt-6 text-center text-ink-400">Quiet in here… say hi 👋</p>}
            {messages.map((m) => (
              <p key={m.id} className="break-words leading-snug">
                <span className={`font-semibold ${m.userId === user.id ? 'text-neon-cyan' : 'text-neon-pink'}`}>{m.username}</span>
                <span className="text-ink-400">: </span>
                <span className="text-ink-100">{m.text}</span>
              </p>
            ))}
          </div>
          <form onSubmit={send} className="mt-2 flex gap-2">
            <input
              className="input !py-2"
              placeholder={connected ? 'Message the lobby…' : 'Connecting…'}
              value={text}
              maxLength={300}
              disabled={!connected}
              onChange={(e) => setText(e.target.value)}
              aria-label="Chat message"
            />
            <button className="btn-pink !px-3" disabled={!connected || !text.trim()}>
              Send
            </button>
          </form>
        </>
      )}
    </div>
  );
}
