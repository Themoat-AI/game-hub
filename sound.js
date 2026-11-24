// Tiny WebAudio synth for game sound effects. No audio assets to download.
// Mute state is global so the game wrapper's toggle works for every built-in game.

const KEY = 'gh_muted';
let muted = false;
try {
  muted = localStorage.getItem(KEY) === '1';
} catch {
  /* ignore */
}

const listeners = new Set();
let ctx = null;

export const isMuted = () => muted;
export function setMuted(next) {
  muted = Boolean(next);
  try {
    localStorage.setItem(KEY, muted ? '1' : '0');
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn(muted));
}
export function subscribeMuted(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function beep({ freq = 440, to = freq, dur = 0.08, type = 'square', vol = 0.04, delay = 0 } = {}) {
  if (muted) return;
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to !== freq) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch {
    /* audio not available — silently ignore */
  }
}

export const sfx = {
  click: () => beep({ freq: 520, to: 780, dur: 0.05, type: 'triangle' }),
  eat: () => beep({ freq: 660, to: 990, dur: 0.07 }),
  die: () => {
    beep({ freq: 300, to: 60, dur: 0.35, type: 'sawtooth', vol: 0.05 });
  },
  bounce: () => beep({ freq: 330, dur: 0.04, type: 'square', vol: 0.03 }),
  score: () => beep({ freq: 440, to: 880, dur: 0.15, type: 'triangle', vol: 0.05 }),
  place: () => beep({ freq: 400, to: 500, dur: 0.06, type: 'triangle' }),
  buy: () => {
    beep({ freq: 500, dur: 0.06, type: 'triangle' });
    beep({ freq: 750, dur: 0.09, type: 'triangle', delay: 0.06 });
  },
  win: () => [523, 659, 784, 1046].forEach((f, i) => beep({ freq: f, dur: 0.14, type: 'triangle', vol: 0.05, delay: i * 0.1 })),
  lose: () => [330, 262, 196].forEach((f, i) => beep({ freq: f, dur: 0.18, type: 'sawtooth', vol: 0.04, delay: i * 0.13 })),
  tick: () => beep({ freq: 880, dur: 0.05, type: 'sine', vol: 0.04 }),
};
