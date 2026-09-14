import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, PHASE } from '../src/core/game.js';
import { Board, makePuyo, makeGarbage } from '../src/core/board.js';
import { ColorRule } from '../src/core/rules/colorRule.js';
import { WordRule } from '../src/core/rules/wordRule.js';
import { DEATH_COL, DEATH_ROW, VISIBLE_ROWS, ALL_CLEAR_SCORE } from '../src/core/constants.js';

/** Runs the simulation until it reaches a phase that waits on the player. */
function settle(game, seconds = 12) {
  const dt = 1 / 120;
  for (let i = 0; i < seconds * 120; i += 1) {
    if (game.phase === PHASE.FALLING || game.phase === PHASE.GAME_OVER) return;
    game.update(dt);
  }
  throw new Error(`board never settled (stuck in ${game.phase})`);
}

/** Score with the all-clear bonus taken out, so word values can be compared. */
function pointsWithoutAllClear(game) {
  return game.score - ALL_CLEAR_SCORE * game.allClears;
}

/** Replaces the field wholesale, then lets the engine resolve it. */
function loadAndResolve(game, lines) {
  game.board = Board.fromStrings(lines);
  game.piece = null;
  game.chain = 0;
  game.beginSettle();
  settle(game);
}

function newGame(rule, options = {}) {
  return new Game({ rule, seed: 7, ...options });
}

test('a game starts with a pair in play and two more previewed', () => {
  const game = newGame(new ColorRule());
  assert.equal(game.phase, PHASE.FALLING);
  assert.ok(game.piece);
  assert.equal(game.preview().length, 2);
});

test('input is ignored while the board is resolving', () => {
  const game = newGame(new ColorRule());
  game.phase = PHASE.POPPING;
  assert.equal(game.move(-1), false);
  assert.equal(game.rotate(1), false);
  assert.equal(game.hardDrop(), false);
});

test('a hard drop lands the pair and hands over the next one', () => {
  const game = newGame(new ColorRule());
  const before = game.piece;
  game.hardDrop();
  assert.equal(game.piece, null);
  settle(game);
  assert.equal(game.piecesPlaced, 1);
  assert.notEqual(game.piece, before);
  assert.equal(game.board.count(), 2);
});

test('four of a colour pop and score 40', () => {
  const game = newGame(new ColorRule());
  loadAndResolve(game, ['1111..']);
  assert.equal(game.board.count(), 0);
  assert.equal(game.maxChain, 1);
  // 40 for the pop, plus the all-clear bonus for emptying the field.
  assert.equal(game.score, 40 + ALL_CLEAR_SCORE);
  assert.equal(game.allClears, 1);
});

test('three of a colour do not pop', () => {
  const game = newGame(new ColorRule());
  loadAndResolve(game, ['111...']);
  assert.equal(game.board.count(), 3);
  assert.equal(game.score, 0);
});

test('a two-step chain resolves on its own and scores both steps', () => {
  const game = newGame(new ColorRule());
  //  Popping the four 1s drops the 2s together into a group of four.
  loadAndResolve(game, [
    '2.....',
    '2.....',
    '2.....',
    '1.....',
    '1.....',
    '1.....',
    '12....',
  ]);
  assert.equal(game.maxChain, 2);
  assert.equal(game.board.count(), 0);
  // 40 for the first step, 320 for the second, plus the all clear.
  assert.equal(game.score, 40 + 320 + ALL_CLEAR_SCORE);
});

test('nuisance beside a pop is swept away with it', () => {
  const game = newGame(new ColorRule());
  const lines = ['X1....', 'X1....', 'X1....', 'X1....'];
  loadAndResolve(game, lines);
  // The four 1s pop; every garbage puyo touching them goes too.
  assert.equal(game.board.count(), 0);
});

test('nuisance out of reach of the pop survives', () => {
  const game = newGame(new ColorRule());
  loadAndResolve(game, ['.....X', '1111.X']);
  assert.equal(game.board.count(), 2, 'both garbage puyos remain');
});

test('the hidden 13th row holds puyos but never pops them', () => {
  const game = newGame(new ColorRule());
  const board = new Board();
  // Column 0, bottom to top: eight alternating puyos that cannot group, then
  // four of colour 1 filling the visible rows, then a fifth in the hidden row.
  for (let y = 0; y < VISIBLE_ROWS - 4; y += 1) board.set(0, y, makePuyo(y % 2 === 0 ? 2 : 3));
  for (let y = VISIBLE_ROWS - 4; y < VISIBLE_ROWS; y += 1) board.set(0, y, makePuyo(1));
  board.set(0, VISIBLE_ROWS, makePuyo(1));
  game.board = board;
  game.piece = null;
  game.beginSettle();
  settle(game);
  // Exactly four popped: the puyo parked in the hidden row was not part of
  // the group, so it just fell onto the stack.
  assert.equal(game.board.get(0, VISIBLE_ROWS), null);
  assert.equal(game.board.count(), VISIBLE_ROWS - 4 + 1);
  assert.equal(game.board.get(0, VISIBLE_ROWS - 4).color, 1);
});

test('filling the death square ends the game', () => {
  const game = newGame(new ColorRule());
  const board = new Board();
  for (let y = 0; y <= DEATH_ROW; y += 1) board.set(DEATH_COL, y, makeGarbage());
  game.board = board;
  game.piece = null;
  game.beginSettle();
  settle(game);
  assert.equal(game.phase, PHASE.GAME_OVER);
});

test('a word pops and is written to the word log', () => {
  const game = newGame(new WordRule());
  loadAndResolve(game, ['CAT...']);
  assert.equal(game.board.count(), 0);
  assert.equal(game.wordLog.length, 1);
  assert.equal(game.wordLog[0].word, 'cat');
  assert.ok(game.coins > 0);
});

test('a word chain pays more than the same words spelled at once', () => {
  // DOG pops on the bottom row; the A and T resting on it fall next to the C
  // and spell CAT, which pops as the second link.
  const chained = newGame(new WordRule());
  loadAndResolve(chained, [
    '.AT...',
    'CDOG..',
  ]);
  assert.equal(chained.maxChain, 2);
  assert.equal(chained.board.count(), 0);

  // The same two three-letter words, but spelled simultaneously.
  const flat = newGame(new WordRule());
  loadAndResolve(flat, ['TOP...', 'CAT...']);
  assert.equal(flat.maxChain, 1);

  assert.ok(
    pointsWithoutAllClear(chained) > pointsWithoutAllClear(flat),
    `chained ${pointsWithoutAllClear(chained)} should beat `
      + `simultaneous ${pointsWithoutAllClear(flat)}`,
  );
});

test('coins accumulate across a session and never go backwards', () => {
  const game = newGame(new WordRule());
  loadAndResolve(game, ['CAT...']);
  const first = game.coins;
  assert.ok(first > 0);
  loadAndResolve(game, ['SCHOOL']);
  assert.ok(game.coins > first);
  assert.equal(game.wordLog.length, 2);
});

test('a longer word out-earns a short one by a wide margin', () => {
  const short = newGame(new WordRule());
  loadAndResolve(short, ['CAT...']);
  const long = newGame(new WordRule());
  loadAndResolve(long, ['SCHOOL']);
  assert.ok(long.coins >= short.coins * 4, `${long.coins} vs ${short.coins}`);
  assert.ok(
    pointsWithoutAllClear(long) >= pointsWithoutAllClear(short) * 4,
    `${pointsWithoutAllClear(long)} vs ${pointsWithoutAllClear(short)}`,
  );
});

test('nuisance is offset by what the field is holding', () => {
  const game = newGame(new ColorRule(), { garbage: true });
  game.outgoingGarbage = 4;
  assert.equal(game.receiveGarbage(6), 2);
  assert.equal(game.outgoingGarbage, 0);
  assert.equal(game.incomingGarbage, 2);
});

test('a chain cancels nuisance that arrived while it was resolving', () => {
  const game = newGame(new ColorRule(), { garbage: true });
  // The opponent's attack lands first, with nothing yet to offset it.
  assert.equal(game.receiveGarbage(20), 20);
  assert.equal(game.incomingGarbage, 20);

  // Then this field finishes a chain worth well over 20 nuisance.
  loadAndResolve(game, [
    '2.....',
    '2.....',
    '2.....',
    '1.....',
    '1.....',
    '1.....',
    '12....',
  ]);
  // 360 points is 5 nuisance, so 5 of the 20 are wiped out and the rest land.
  assert.equal(game.outgoingGarbage, 0);
  assert.equal(game.board.count(), 15, '15 of the 20 nuisance puyos fell');
});

test('nuisance drops as evenly as it can across the columns', () => {
  const game = newGame(new ColorRule(), { garbage: true });
  game.incomingGarbage = 12;
  game.dropGarbage();
  for (let x = 0; x < game.board.cols; x += 1) {
    assert.equal(game.board.columnHeight(x), 2);
  }
});

test('a chain sends nuisance at the Tsu rate', () => {
  const game = newGame(new ColorRule(), { garbage: true });
  loadAndResolve(game, [
    '2.....',
    '2.....',
    '2.....',
    '1.....',
    '1.....',
    '1.....',
    '12....',
  ]);
  // The chain itself is worth 40 + 320 = 360, which buys 5 nuisance at the
  // Tsu rate of 70.  The all-clear score bonus deliberately does not attack;
  // instead it arms the +30 that rides along with the next chain.
  assert.equal(game.outgoingGarbage, Math.floor(360 / 70));
  assert.ok(game.allClearBonusPending);
  game.addOutgoing(1);
  assert.equal(game.outgoingGarbage, 5 + 1 + 30);
});

test('the same seed replays identically', () => {
  const play = (seed) => {
    const game = new Game({ rule: new ColorRule(), seed });
    for (let i = 0; i < 30 && !game.isOver; i += 1) {
      game.move(i % 2 === 0 ? -1 : 1);
      game.rotate(1);
      game.hardDrop();
      settle(game, 20);
    }
    return { score: game.score, board: game.board.toStrings().join('\n') };
  };
  assert.deepEqual(play(1234), play(1234));
  assert.notDeepEqual(play(1234).board, play(4321).board);
});

test('a long unattended game always terminates rather than locking up', () => {
  const game = new Game({ rule: new WordRule(), seed: 99 });
  let pieces = 0;
  while (!game.isOver && pieces < 400) {
    game.hardDrop();
    settle(game, 30);
    pieces += 1;
  }
  assert.ok(game.isOver, 'stacking in one column should eventually top out');
  assert.ok(pieces < 400);
});
