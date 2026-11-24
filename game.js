/*
 * Memory Match — a tiny standalone HTML5 game that demonstrates the Game Hub embed protocol.
 *
 * It is loaded in a sandboxed <iframe> and speaks to the hub with postMessage:
 *
 *   hub  → game   { source: 'game-hub', type: 'init' | 'pause' | 'resume' | 'mute' | 'unmute', paused?, muted? }
 *   game → hub    { source: 'game-hub-game', type: 'ready' }
 *                 { source: 'game-hub-game', type: 'score',    score }   live score for the hub header
 *                 { source: 'game-hub-game', type: 'gameover', score }   final score → leaderboard
 *
 * Copy this file's "hub bridge" section into any HTML5 game to make it hub-compatible.
 */
(() => {
  'use strict';

  // ── hub bridge ───────────────────────────────────────────────────────────
  const hub = { paused: false, muted: false };
  const toHub = (type, extra) => parent.postMessage({ source: 'game-hub-game', type, ...extra }, '*');

  window.addEventListener('message', (e) => {
    const m = e.data;
    if (e.source !== parent || !m || m.source !== 'game-hub') return;
    if (m.type === 'init') {
      hub.paused = !!m.paused;
      hub.muted = !!m.muted;
    }
    if (m.type === 'pause') hub.paused = true;
    if (m.type === 'resume') hub.paused = false;
    if (m.type === 'mute') hub.muted = true;
    if (m.type === 'unmute') hub.muted = false;
    renderPause();
  });

  // ── tiny synth (respects hub mute) ───────────────────────────────────────
  let audio;
  function beep(freq, dur = 0.09, type = 'triangle') {
    if (hub.muted) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.05, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
      o.connect(g).connect(audio.destination);
      o.start();
      o.stop(audio.currentTime + dur);
    } catch (_) {
      /* no audio */
    }
  }

  // ── game ─────────────────────────────────────────────────────────────────
  const EMOJI = ['🚀', '🪐', '👾', '🎲', '🍒', '⚡', '🔮', '🎯'];
  const $ = (id) => document.getElementById(id);
  const board = $('board');

  let cards, first, second, lock, moves, matched, seconds, timer, running;

  const score = () => Math.max(10, Math.round(1000 - Math.max(0, moves - 8) * 25 - seconds * 4));

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function newGame() {
    clearInterval(timer);
    cards = shuffle([...EMOJI, ...EMOJI]);
    first = second = null;
    lock = false;
    moves = 0;
    matched = 0;
    seconds = 0;
    running = false;
    $('overlay').classList.remove('show');
    board.innerHTML = '';
    cards.forEach((symbol, i) => {
      const b = document.createElement('button');
      b.className = 'card';
      b.setAttribute('role', 'gridcell');
      b.setAttribute('aria-label', 'Card ' + (i + 1));
      b.innerHTML = '<div class="inner"><div class="face front">?</div><div class="face back">' + symbol + '</div></div>';
      b.addEventListener('click', () => flip(b, i));
      board.appendChild(b);
    });
    hud();
    toHub('score', { score: 0 });
  }

  function hud() {
    $('moves').textContent = moves;
    $('time').textContent = seconds;
    $('pairs').textContent = matched;
  }

  function startTimer() {
    if (running) return;
    running = true;
    timer = setInterval(() => {
      if (hub.paused) return;
      seconds++;
      hud();
    }, 1000);
  }

  function flip(el, i) {
    if (hub.paused || lock || el.classList.contains('flipped') || el.classList.contains('matched')) return;
    startTimer();
    el.classList.add('flipped');
    beep(520 + i * 12);
    if (first === null) {
      first = i;
      return;
    }
    second = i;
    moves++;
    lock = true;
    hud();
    const [a, b] = [board.children[first], board.children[second]];
    if (cards[first] === cards[second]) {
      a.classList.add('matched');
      b.classList.add('matched');
      matched++;
      beep(880, 0.16);
      first = second = null;
      lock = false;
      hud();
      toHub('score', { score: score() });
      if (matched === EMOJI.length) win();
    } else {
      setTimeout(() => {
        a.classList.remove('flipped');
        b.classList.remove('flipped');
        first = second = null;
        lock = false;
      }, 700);
    }
  }

  function win() {
    clearInterval(timer);
    running = false;
    const s = score();
    $('summary').textContent = 'Solved in ' + moves + ' moves and ' + seconds + 's.';
    $('final').textContent = s;
    $('overlay').classList.add('show');
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.14), i * 110));
    toHub('gameover', { score: s });
  }

  function renderPause() {
    document.body.style.opacity = hub.paused ? '0.35' : '1';
    board.style.pointerEvents = hub.paused ? 'none' : '';
  }

  $('again').addEventListener('click', newGame);
  newGame();
  toHub('ready');
})();
