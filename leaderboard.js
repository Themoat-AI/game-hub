// Leaderboard math. Each game declares how a player's standing is computed:
//   scoring = "best"  → highest single score   (Snake, Memory Match…)
//   scoring = "total" → sum of all scores      (multiplayer wins, idle games…)
//
// Global ranking sums each player's per-game standing ("hub points").
// This is computed with SQL aggregates + a small in-memory reduce, which is
// fine up to tens of thousands of players. For larger scale, cache the result
// (Redis / materialised view) — the API shape stays the same.

const aggFor = (scoring) => (scoring === 'total' ? { _sum: { score: true } } : { _max: { score: true } });
const valueOf = (row, scoring) => (scoring === 'total' ? row._sum.score : row._max.score) ?? 0;

/** Competition ranking: equal values share a rank (1,2,2,4). */
function withRanks(rows) {
  let rank = 0;
  let prev = null;
  return rows.map((row, i) => {
    if (row.score !== prev) {
      rank = i + 1;
      prev = row.score;
    }
    return { ...row, rank };
  });
}

async function attachUsers(prisma, rows) {
  const users = await prisma.user.findMany({
    where: { id: { in: rows.map((r) => r.userId) } },
    select: { id: true, username: true, isGuest: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  return rows
    .filter((r) => byId.has(r.userId))
    .map((r) => ({
      rank: r.rank,
      userId: r.userId,
      username: byId.get(r.userId).username,
      isGuest: byId.get(r.userId).isGuest,
      score: r.score,
    }));
}

export async function gameLeaderboard(prisma, game, limit = 20) {
  const scoring = game.scoring;
  const rows = await prisma.score.groupBy({
    by: ['userId'],
    where: { gameId: game.id },
    ...aggFor(scoring),
    orderBy: [scoring === 'total' ? { _sum: { score: 'desc' } } : { _max: { score: 'desc' } }, { userId: 'asc' }],
    take: limit,
  });
  const ranked = withRanks(rows.map((r) => ({ userId: r.userId, score: valueOf(r, scoring) })));
  return attachUsers(prisma, ranked);
}

/** A player's standing + rank in one game (null when they have never scored). */
export async function userGameStanding(prisma, game, userId) {
  const scoring = game.scoring;
  const mine = await prisma.score.aggregate({ where: { gameId: game.id, userId }, ...aggFor(scoring), _count: true });
  if (!mine._count) return null;
  const value = valueOf(mine, scoring);
  const ahead = await prisma.score.groupBy({
    by: ['userId'],
    where: { gameId: game.id },
    ...aggFor(scoring),
    having: { score: scoring === 'total' ? { _sum: { gt: value } } : { _max: { gt: value } } },
  });
  return { score: value, rank: ahead.length + 1 };
}

async function globalTotals(prisma) {
  const [games, rows] = await Promise.all([
    prisma.game.findMany({ select: { id: true, scoring: true } }),
    prisma.score.groupBy({ by: ['userId', 'gameId'], _max: { score: true }, _sum: { score: true } }),
  ]);
  const scoringOf = new Map(games.map((g) => [g.id, g.scoring]));
  const totals = new Map();
  for (const r of rows) {
    const v = valueOf(r, scoringOf.get(r.gameId) ?? 'best');
    totals.set(r.userId, (totals.get(r.userId) ?? 0) + v);
  }
  return [...totals.entries()]
    .map(([userId, score]) => ({ userId, score }))
    .sort((a, b) => b.score - a.score || (a.userId < b.userId ? -1 : 1));
}

export async function globalLeaderboard(prisma, limit = 20) {
  const all = await globalTotals(prisma);
  return attachUsers(prisma, withRanks(all).slice(0, limit));
}

export async function userGlobalStanding(prisma, userId) {
  const ranked = withRanks(await globalTotals(prisma));
  const mine = ranked.find((r) => r.userId === userId);
  return mine ? { score: mine.score, rank: mine.rank, players: ranked.length } : { score: 0, rank: null, players: ranked.length };
}

/** Everything the dashboard's stats panel needs. */
export async function userStats(prisma, user) {
  const [games, global, recent] = await Promise.all([
    prisma.game.findMany({ orderBy: { sortOrder: 'asc' } }),
    userGlobalStanding(prisma, user.id),
    prisma.score.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { game: { select: { slug: true, title: true } } },
    }),
  ]);
  const standings = await Promise.all(games.map((g) => userGameStanding(prisma, g, user.id)));
  const perGame = games
    .map((g, i) => (standings[i] ? { slug: g.slug, title: g.title, scoring: g.scoring, ...standings[i] } : null))
    .filter(Boolean);
  return {
    gamesPlayed: user.gamesPlayed,
    points: global.score,
    rank: global.rank,
    players: global.players,
    perGame,
    recent: recent.map((s) => ({
      id: s.id,
      score: s.score,
      createdAt: s.createdAt,
      game: s.game.slug,
      gameTitle: s.game.title,
    })),
  };
}
