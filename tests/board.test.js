import test from 'node:test';
import assert from 'node:assert/strict';
import { Board, makeGarbage, makePuyo } from '../src/core/board.js';
import { VISIBLE_ROWS } from '../src/core/constants.js';

test('gravity settles floating puyos to the bottom of their column', () => {
  const board = new Board();
  board.set(0, 5, makePuyo(1));
  board.set(0, 9, makePuyo(2));
  const moves = board.applyGravity();
  assert.equal(moves.length, 2);
  assert.equal(board.get(0, 0).color, 1);
  assert.equal(board.get(0, 1).color, 2);
  assert.equal(board.get(0, 5), null);
});

test('gravity leaves an already settled column untouched', () => {
  const board = Board.fromStrings(['11....', '11....']);
  assert.equal(board.applyGravity().length, 0);
});

test('connected group follows colour through four directions', () => {
  const board = Board.fromStrings([
    '.1....',
    '11....',
    '12....',
  ]);
  // (0,0) (0,1) (1,1) (1,2) are one colour and all touch; (1,0) is not.
  const group = board.connectedGroup(0, 1);
  assert.equal(group.length, 4);
});

test('garbage never joins a colour group', () => {
  const board = Board.fromStrings(['1X1...']);
  assert.equal(board.connectedGroup(0, 0).length, 1);
  assert.equal(board.connectedGroup(1, 0).length, 0);
});

test('the hidden 13th row is outside scoring', () => {
  const board = new Board();
  assert.ok(board.isScoringSquare(0, VISIBLE_ROWS - 1));
  assert.ok(!board.isScoringSquare(0, VISIBLE_ROWS));
  board.set(0, VISIBLE_ROWS, makePuyo(1));
  board.set(0, VISIBLE_ROWS - 1, makePuyo(1));
  // The puyo parked in the hidden row must not extend the group below it.
  assert.equal(board.connectedGroup(0, VISIBLE_ROWS - 1).length, 1);
});

test('garbage adjacent to a pop is swept up, diagonals are not', () => {
  const board = new Board();
  board.set(1, 0, makePuyo(1));
  board.set(0, 0, makeGarbage()); // beside
  board.set(2, 1, makeGarbage()); // diagonal
  const swept = board.garbageTouching([{ x: 1, y: 0 }]);
  assert.deepEqual(swept, [{ x: 0, y: 0 }]);
});

test('fromStrings and toStrings round-trip', () => {
  const board = Board.fromStrings(['.1X...', '1122..']);
  const lines = board.toStrings();
  assert.equal(lines.at(-1), '1122..');
  assert.equal(lines.at(-2), '.1X...');
  assert.equal(lines.at(-3), '......');
});

test('column height and drop row agree', () => {
  const board = Board.fromStrings(['1.....', '1.....']);
  assert.equal(board.columnHeight(0), 2);
  assert.equal(board.dropRow(0), 2);
  assert.equal(board.columnHeight(1), 0);
  assert.equal(board.dropRow(1), 0);
});
