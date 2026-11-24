import { useCallback, useEffect, useRef } from 'react';

/**
 * Embeds any HTML5 game in a sandboxed iframe and bridges it to the hub's
 * pause / mute / score controls via postMessage.
 *
 * Hub → game   { source: 'game-hub', type: 'init' | 'pause' | 'resume' | 'mute' | 'unmute', paused?, muted? }
 * Game → hub   { source: 'game-hub-game', type: 'ready' }
 *              { source: 'game-hub-game', type: 'score',    score }   (live score for the header)
 *              { source: 'game-hub-game', type: 'gameover', score }   (final score → leaderboard)
 *
 * Games that never send messages still work — they just won't react to the controls.
 */
export default function ExternalGame({ host, fullscreen }) {
  const { game, paused, muted, submitScore, setLiveScore } = host;
  const frame = useRef(null);
  const stateRef = useRef({ paused, muted });
  stateRef.current = { paused, muted };

  const post = useCallback((type, extra = {}) => {
    // The sandboxed iframe has an opaque origin, so '*' is required; we verify the
    // *sender* of incoming messages instead (event.source === our iframe).
    frame.current?.contentWindow?.postMessage({ source: 'game-hub', type, ...extra }, '*');
  }, []);

  useEffect(() => {
    function onMessage(event) {
      if (event.source !== frame.current?.contentWindow) return;
      const msg = event.data;
      if (!msg || msg.source !== 'game-hub-game') return;
      if (msg.type === 'ready') post('init', stateRef.current);
      else if (msg.type === 'score' && Number.isFinite(msg.score)) setLiveScore(Math.floor(msg.score));
      else if (msg.type === 'gameover' && Number.isFinite(msg.score)) {
        setLiveScore(Math.floor(msg.score));
        submitScore(Math.floor(msg.score));
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [post, setLiveScore, submitScore]);

  useEffect(() => post(paused ? 'pause' : 'resume'), [paused, post]);
  useEffect(() => post(muted ? 'mute' : 'unmute'), [muted, post]);

  return (
    <iframe
      ref={frame}
      src={game.url}
      title={game.title}
      sandbox="allow-scripts allow-pointer-lock allow-popups"
      allow="autoplay; fullscreen"
      referrerPolicy="no-referrer"
      loading="lazy"
      className={`w-full rounded-xl border-0 bg-black ${fullscreen ? 'h-full' : 'h-[min(72vh,640px)] min-h-[420px]'}`}
    />
  );
}
