/** Shared end-of-match card + opponent presence banner for the multiplayer games. */

export function OpponentBanner({ opponent }) {
  if (!opponent) return null;
  const left = opponent.status === 'left';
  return (
    <p
      role="status"
      className={`rounded-lg border px-3 py-2 text-center text-sm ${
        left ? 'border-neon-pink/50 bg-neon-pink/10 text-neon-pink' : 'border-neon-amber/50 bg-neon-amber/10 text-neon-amber'
      }`}
    >
      {left
        ? 'Your opponent left the match.'
        : `Your opponent disconnected — they have ${Math.round((opponent.graceMs ?? 10000) / 1000)}s to reconnect before you win.`}
    </p>
  );
}

const REASONS = { forfeit: 'by forfeit', disconnect: 'by disconnect' };

export function MatchResult({ over, you, players, rematchFrom, rematchSent, opponentLeft, onRematch, onLeave }) {
  const draw = over.winner === null;
  const won = over.winner === you;
  const title = draw ? 'DRAW' : won ? 'VICTORY' : 'DEFEAT';
  const tone = draw ? 'text-neon-amber' : won ? 'text-neon-lime' : 'text-neon-pink';
  const opp = players[1 - you]?.username ?? 'Opponent';
  const reward = over.rewards?.[you] ?? 0;

  return (
    <div className="panel mx-auto w-full max-w-sm p-5 text-center">
      <p className={`font-display text-3xl font-black tracking-widest ${tone}`}>{title}</p>
      <p className="mt-1 text-sm text-ink-200">
        {draw ? `You and ${opp} are even.` : won ? `You beat ${opp}` : `${opp} wins`}
        {REASONS[over.reason] ? ` ${REASONS[over.reason]}` : ''}.
      </p>
      {over.scores && (over.scores[0] > 0 || over.scores[1] > 0) && (
        <p className="mt-1 font-display text-lg tabular-nums">
          {over.scores[you]} <span className="text-ink-400">–</span> {over.scores[1 - you]}
        </p>
      )}
      <p className="mt-2 text-sm">
        {reward > 0 ? (
          <>
            <b className="text-neon-lime">+{reward} pts</b> added to your hub score
          </>
        ) : (
          <span className="text-ink-400">No points this time</span>
        )}
      </p>
      {rematchFrom && !rematchSent && <p className="mt-3 text-sm text-neon-cyan">{rematchFrom} wants a rematch!</p>}
      <div className="mt-4 flex justify-center gap-3">
        <button className="btn-primary" onClick={onRematch} disabled={rematchSent || opponentLeft}>
          {rematchSent ? 'Waiting…' : '↻ Rematch'}
        </button>
        <button className="btn-ghost" onClick={onLeave}>
          Back to lobby
        </button>
      </div>
    </div>
  );
}
