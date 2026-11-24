import { lazy } from 'react';

/**
 * Built-in games, keyed by the `slug` in the database. Each is code-split and
 * receives `{ host, fullscreen }` from <GamePage> (see components/GameFrame.jsx).
 *
 * External HTML5 games need no entry here: register them in the database with
 * `type: "external"` + `url` and they load through <ExternalGame> automatically.
 */
export const BUILTIN_GAMES = {
  snake: lazy(() => import('./SnakeGame.jsx')),
  clicker: lazy(() => import('./ClickerGame.jsx')),
  'tic-tac-toe': lazy(() => import('./TicTacToeGame.jsx')),
  pong: lazy(() => import('./PongGame.jsx')),
};
