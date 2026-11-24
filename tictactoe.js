// Pure, server-authoritative Tic-Tac-Toe engine. Player 0 = X, player 1 = O.

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
  [0, 4, 8], [2, 4, 6], // diagonals
];

export function findWinner(board) {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (board[a] !== null && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line };
    }
  }
  return null;
}

export const ticTacToe = {
  slug: 'tic-tac-toe',

  create() {
    return { board: Array(9).fill(null), turn: 0, winner: null, line: null, draw: false, over: false };
  },

  /** action = { cell: 0..8 }. Returns { error } when the move is illegal. */
  onAction(state, player, action) {
    if (state.over) return { error: 'The game is over' };
    if (player !== state.turn) return { error: "It's not your turn" };
    const cell = action?.cell;
    if (!Number.isInteger(cell) || cell < 0 || cell > 8) return { error: 'Invalid square' };
    if (state.board[cell] !== null) return { error: 'That square is taken' };

    state.board[cell] = player;
    const win = findWinner(state.board);
    if (win) {
      state.winner = win.winner;
      state.line = win.line;
      state.over = true;
    } else if (state.board.every((c) => c !== null)) {
      state.draw = true;
      state.over = true;
    } else {
      state.turn = 1 - player;
    }
    return {};
  },

  snapshot(state) {
    return { board: state.board, turn: state.turn, winner: state.winner, line: state.line, draw: state.draw, over: state.over };
  },

  /** null while in progress, otherwise the final result. */
  result(state) {
    if (!state.over) return null;
    return { winner: state.draw ? null : state.winner, scores: [0, 0] };
  },

  /** Hub points awarded per player: win 10, draw 3, loss 0. */
  rewards(result) {
    if (result.winner === null) return [3, 3];
    return result.winner === 0 ? [10, 0] : [0, 10];
  },
};
