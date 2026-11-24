import { pathToFileURL } from 'node:url';

// Built-in catalogue. `assets` drive the card art in the client (emoji + gradient).
export const GAMES = [
  {
    slug: 'pong',
    title: 'Neon Pong',
    description: 'Real-time 1v1 Pong with a server-authoritative ball. First to 7 wins — matchmake or invite a friend with a room code.',
    category: 'Arcade',
    multiplayer: true,
    featured: true,
    scoring: 'total',
    maxScore: 1000,
    tags: ['pong', '2-player', 'realtime', 'paddle'],
    assets: { icon: '🏓', from: '#22f0ff', to: '#6d28d9', tagline: 'Rally. Return. Repeat.', controls: 'W/S or ↑/↓ — or hold the on-screen buttons' },
    sortOrder: 1,
  },
  {
    slug: 'snake',
    title: 'Neon Snake',
    description: 'Classic snake with a glow-up. Eat, grow, speed up — and never touch the walls or yourself.',
    category: 'Arcade',
    featured: true,
    scoring: 'best',
    maxScore: 5000,
    tags: ['snake', 'classic', 'solo'],
    assets: { icon: '🐍', from: '#b6ff3c', to: '#0ea5a4', tagline: 'How long can you get?', controls: 'Arrow keys / WASD, swipe, or the D-pad' },
    sortOrder: 2,
  },
  {
    slug: 'tic-tac-toe',
    title: 'Tic-Tac-Toe Duel',
    description: 'Turn-based 2-player Tic-Tac-Toe over WebSockets with live moves, rematches and lobby chat.',
    category: 'Strategy',
    multiplayer: true,
    featured: false,
    scoring: 'total',
    maxScore: 100,
    tags: ['tic-tac-toe', 'noughts', '2-player', 'turn-based'],
    assets: { icon: '⭕', from: '#ff3cac', to: '#784ba0', tagline: 'Three in a row wins.', controls: 'Click or tap a square' },
    sortOrder: 3,
  },
  {
    slug: 'clicker',
    title: 'Cosmic Clicker',
    description: 'An idle game about harvesting stardust. Buy upgrades, automate the cosmos — progress is saved to your account.',
    category: 'Strategy',
    featured: false,
    scoring: 'best',
    maxScore: 1_000_000_000,
    tags: ['idle', 'clicker', 'incremental', 'save'],
    assets: { icon: '✨', from: '#fbbf24', to: '#ef4444', tagline: 'Click. Upgrade. Ascend.', controls: 'Click / tap the star, or press Space' },
    sortOrder: 4,
  },
  {
    slug: 'memory-match',
    title: 'Memory Match',
    description: 'An external HTML5 game running inside the hub’s embed wrapper — it talks to the hub over postMessage for pause, mute and scores.',
    category: 'Puzzle',
    type: 'external',
    url: '/ext/memory/index.html',
    featured: false,
    scoring: 'best',
    maxScore: 1000,
    tags: ['memory', 'cards', 'puzzle', 'embed'],
    assets: { icon: '🃏', from: '#60a5fa', to: '#a78bfa', tagline: 'Find every pair, fast.', controls: 'Click or tap cards' },
    sortOrder: 5,
  },
];

/** Idempotent: inserts new games and refreshes catalogue fields; keeps play counts. */
export async function seedGames(prisma) {
  for (const g of GAMES) {
    const { slug, ...rest } = g;
    await prisma.game.upsert({
      where: { slug },
      create: { slug, ...rest },
      update: rest,
    });
  }
  return GAMES.length;
}

// `npm run db:seed`
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { loadConfig } = await import('./config.js');
  const { createPrisma } = await import('./db.js');
  const config = loadConfig();
  const prisma = createPrisma(config.databaseUrl);
  const n = await seedGames(prisma);
  console.log(`Seeded ${n} games`);
  await prisma.$disconnect();
}
