import { useEffect, useRef, useState } from 'react';
import MatchLobby from '../components/MatchLobby.jsx';
import { sfx } from '../lib/sound.js';
import { MatchResult, OpponentBanner } from './MatchResult.jsx';
import { useMatch } from './useMatch.js';

const MARK = ['X', 'O'];
const TONE = ['text-neon-cyan', 'text-neon-pink'];

export default function TicTacToeGame({ host }) {
  const hostRef = useRef(host);
  hostRef.current = host;
  const youRef = useRef(null);
  const m = useMatch('tic-tac-toe', {
    onOver: (res) => {
      hostRef.current.matchFinished();
      if (res.winner === null) return;
      res.winner === youRef.current ? sfx.win() : sfx.lose();
    },
  });
  const { info, state, over, opponent } = m;
  youRef.current = info?.you ?? null;

  const [rematchSent, setRematchSent] = useState(false);
  useEffect(() => setRematchSent(false), [info?.matchId]);

  // Click sound whenever a new mark lands
  const marks = state ? state.board.filter((c) => c !== null).length : 0;
  const prevMarks = useRef(0);
  useEffect(() => {
    if (marks > prevMarks.current) sfx.place();
    prevMarks.current = marks;
  }, [marks]);

  if (m.phase !== 'playing' && m.phase !== 'over') {
    return (
      <MatchLobby
        title="Tic-Tac-Toe Duel"
        blurb="Three in a row wins. Win = 10 pts, draw = 3 pts."
        phase={m.phase}
        roomCode={m.roomCode}
        connected={m.connected}
        onFind={m.findMatch}
        onCancel={m.cancel}
        onCreateRoom={m.createRoom}
        onJoinRoom={m.joinRoom}
      />
    );
  }

  const you = info.you;
  const opp = info.players[1 - you];
  const myTurn = state && !state.over && state.turn === you;

  const play = (cell) => {
    if (!myTurn || state.board[cell] !== null) return;
    m.act({ cell }, (res) => !res?.ok && host.toast.error(res?.error || 'Move rejected'));
  };

  const status = state?.over
    ? null
    : myTurn
      ? 'Your turn'
      : `Waiting for ${opp.username}…`;

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-4">
      <div className="flex w-full items-center justify-between text-sm">
        <span className={`font-display font-bold ${TONE[you]}`}>
          You · {MARK[you]}
        </span>
        <span className="text-ink-400">vs</span>
        <span className={`max-w-[10rem] truncate font-display font-bold ${TONE[1 - you]}`}>
          {opp.username} · {MARK[1 - you]}
        </span>
      </div>

      <OpponentBanner opponent={opponent} />

      {status && (
        <p
          aria-live="polite"
          className={`rounded-full border px-4 py-1 font-display text-xs uppercase tracking-widest ${
            myTurn ? 'border-neon-lime/60 text-neon-lime' : 'border-ink-600 text-ink-400'
          }`}
        >
          {status}
        </p>
      )}

      <div className="grid aspect-square w-full max-w-xs grid-cols-3 gap-2" role="grid" aria-label="Tic-tac-toe board">
        {state.board.map((cell, i) => {
          const win = state.line?.includes(i);
          return (
            <button
              key={i}
              role="gridcell"
              onClick={() => play(i)}
              disabled={!myTurn || cell !== null}
              aria-label={`Square ${i + 1}${cell !== null ? `, ${MARK[cell]}` : ''}`}
              className={`grid place-items-center rounded-2xl border font-display text-5xl font-black transition sm:text-6xl
                ${win ? 'border-neon-lime bg-neon-lime/15 shadow-[0_0_24px_rgba(182,255,60,.4)]' : 'border-ink-600 bg-ink-800/80'}
                ${myTurn && cell === null ? 'cursor-pointer hover:border-neon-cyan/70 hover:bg-ink-700' : 'cursor-default'}
                ${cell !== null ? TONE[cell] : ''}`}
              style={cell !== null ? { textShadow: '0 0 18px currentColor' } : undefined}
            >
              <span className={cell !== null ? 'animate-pop' : ''}>{cell !== null ? MARK[cell] : ''}</span>
            </button>
          );
        })}
      </div>

      {over ? (
        <MatchResult
          over={over}
          you={you}
          players={info.players}
          rematchFrom={m.rematchFrom}
          rematchSent={rematchSent}
          opponentLeft={opponent?.status === 'left'}
          onRematch={() => {
            setRematchSent(true);
            m.rematch();
          }}
          onLeave={m.leave}
        />
      ) : (
        <button className="btn-ghost !py-1.5 text-xs" onClick={() => window.confirm('Leaving forfeits the match. Leave?') && m.leave()}>
          Forfeit &amp; leave
        </button>
      )}
    </div>
  );
}
