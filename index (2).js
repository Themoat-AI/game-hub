import { pong } from './pong.js';
import { ticTacToe } from './tictactoe.js';

/**
 * Registry of server-side multiplayer engines, keyed by game slug.
 *
 * Engine contract:
 *   create()                       → state
 *   onAction(state, player, act)   → {} | { error }
 *   tick?(state, dt)               → events[]      (real-time games only)
 *   snapshot(state)                → JSON sent to clients
 *   result(state)                  → null | { winner: 0|1|null, scores: [n,n] }
 *   rewards(result)                → [pointsForP0, pointsForP1]
 */
export const engines = {
  [pong.slug]: pong,
  [ticTacToe.slug]: ticTacToe,
};
