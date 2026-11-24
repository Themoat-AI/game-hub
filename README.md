# Game Hub

Dark-mode arcade hub: React + Vite + Tailwind 4 client, Express 5 + Socket.io server, PostgreSQL via Prisma 7.

**Games:** Neon Snake · Cosmic Clicker (idle, server-side save states) · Neon Pong (real-time, server-authoritative) · Tic-Tac-Toe Duel (WebSockets) · Memory Match (external HTML5 game in the iframe wrapper).
**Features:** JWT auth (register / login / guest / guest→account upgrade), searchable & filterable catalogue, featured banner, per-game + global leaderboards, player stats, lobby chat + presence, quick match, private room codes, rematches, reconnect grace period, toasts, loading states, error boundary.

## File tree
```
game-hub/
├─ package.json  Dockerfile  docker-compose.yml  render.yaml  railway.json  .env.example
├─ server/
│  ├─ prisma/ schema.prisma · migrations/…/migration.sql
│  ├─ prisma.config.js
│  ├─ src/
│  │  ├─ index.js (boot) · app.js (express + socket.io) · config.js · db.js · seed.js
│  │  ├─ routes/ auth.js · games.js · scores.js
│  │  ├─ middleware/ auth.js        utils/ errors.js
│  │  ├─ services/ leaderboard.js
│  │  ├─ games/ pong.js · tictactoe.js · index.js      (pure, unit-tested engines)
│  │  └─ sockets/ index.js (auth, chat, events) · matches.js (matchmaking, loop, rematch, persistence)
│  └─ test/ engines · api · sockets · static   (32 tests, in-memory Postgres)
└─ client/
   ├─ vite.config.js · vercel.json · index.html · public/ (favicon, ext/memory/ embedded game)
   └─ src/
      ├─ main.jsx · App.jsx · index.css
      ├─ lib/ api.js · sound.js
      ├─ context/ Auth · Toast · Socket
      ├─ components/ Navbar · GameCard · FeaturedBanner · StatsPanel · LeaderboardTable ·
      │              LobbyChat · GameFrame · ExternalGame · MatchLobby · Spinner · ErrorBoundary
      ├─ pages/ Hub · Game · Leaderboard · Profile · Login · NotFound
      └─ games/ registry · Snake · Clicker · Pong · TicTacToe · useMatch · MatchResult
```

## Run locally
```bash
cp .env.example .env            # edit DATABASE_URL / JWT_SECRET
docker compose up -d db         # or use any Postgres 14+
npm install                     # also runs `prisma generate`
npm run db:deploy -w server     # apply migrations (or: npm run db:migrate)
npm run dev                     # client :5173 (proxies to API :4000)
```
Open two browsers (or one normal + one private window), "Play as guest" in each, then Quick match Pong / Tic-Tac-Toe.

Everything in one container: `JWT_SECRET=$(openssl rand -base64 48) docker compose up --build` → http://localhost:4000

Tests: `npm test` (no database needed — they run against PGlite, an in-memory Postgres).

## API
| Route | Notes |
|---|---|
| `POST /api/auth/register` `login` `guest` | returns `{token,user}`; register with a guest token upgrades that account |
| `GET /api/auth/me` · `/verify` | token check + stats |
| `GET /api/games?search&category&multiplayer&sort` · `/featured` · `/categories` · `/:slug` | metadata + assets |
| `POST /api/games` | admin (`x-admin-key`): register an external iframe game |
| `POST /api/games/:slug/play` · `GET/PUT /api/games/:slug/save` | play counter · save state (64 KB) |
| `POST /api/scores` | single-player scores (range-checked, rate-limited) |
| `GET /api/scores/leaderboard` · `/game/:slug` · `/me` | global (hub points) · per game · player stats |

**Sockets** (JWT in `auth.token`): `lobby:join|leave`, `chat:send` → `chat:message`, `lobby:presence`; `queue:join|leave`, `room:create|join`; `match:found|resume|sync|action|state|over|rematch|leave|opponent`.
Multiplayer scores are written **by the server** at match end (clients can't submit them).

## Add your own game
*External HTML5 game:* drop it in `client/public/ext/<name>/` (or host it on https) and register it:
```bash
curl -X POST $URL/api/games -H "x-admin-key: $ADMIN_KEY" -H 'content-type: application/json' \
 -d '{"slug":"my-game","title":"My Game","description":"…","category":"Arcade","url":"/ext/my-game/index.html"}'
```
It loads in a sandboxed iframe with hub pause / mute / fullscreen. For pause & scores, post/listen with the protocol documented at the top of `client/src/components/ExternalGame.jsx` (see `public/ext/memory/game.js`).
*Built-in React game:* add a component taking `{host, fullscreen}`, register it in `client/src/games/registry.js`, add a row to `server/src/seed.js`.

## Deploy
**Render (easiest, one service + Postgres):** push to GitHub → New → Blueprint → select the repo (`render.yaml`). After first deploy set `CLIENT_ORIGIN` to your URL. Migrations run automatically on boot.
**Railway:** New project → Deploy from repo (uses `railway.json`/Dockerfile) → add the PostgreSQL plugin → set `DATABASE_URL` (reference the plugin), `JWT_SECRET`, `CLIENT_ORIGIN`.
**Vercel (client) + Render/Railway (API):** deploy the server as above; on Vercel set root `client/`, build `npm run build`, output `dist`, env `VITE_API_URL=https://<api-host>`; set the server's `CLIENT_ORIGIN` to the Vercel URL.
Notes: run **one** server instance (matchmaking state is in memory; scale out later with the Socket.io Redis adapter). The free Render tier sleeps when idle, which drops live matches.

## Production notes
JWT is stored in `localStorage` (simple, works with sockets); for stricter XSS posture switch to httpOnly cookies. Score submission for single-player games is client-trusted apart from per-game caps — fine for a casual hub, not for prizes.
