import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPrisma } from './db.js';
import { seedGames } from './seed.js';

const config = loadConfig();
const prisma = createPrisma(config.databaseUrl);

await prisma.$connect();
if (config.autoSeed) {
  const n = await seedGames(prisma);
  console.log(`[boot] catalogue synced (${n} games)`);
}

const { httpServer, sockets, close } = createApp({ prisma, config });
httpServer.listen(config.port, '0.0.0.0', () => {
  console.log(`[boot] Game Hub listening on :${config.port} (${config.env})`);
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[boot] ${signal} received, shutting down…`);
  const force = setTimeout(() => process.exit(1), 8000);
  force.unref();
  try {
    await sockets.matches.idle(); // let in-flight result writes finish
    await close();
    await prisma.$disconnect();
  } finally {
    process.exit(0);
  }
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
