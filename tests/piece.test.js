import test from 'node:test';
import assert from 'node:assert/strict';
import { Board, makePuyo } from '../src/core/board.js';
import { Piece } from '../src/core/piece.js';
import { UP, RIGHT, DOWN, LEFT } from '../src/core/constants.js';

function pieceAt(x, y, orientation = UP) {
  return new Piece(makePuyo(1), makePuyo(2), { x, y, orientation });
}

test('rotating clockwise walks the child around the axis', () => {
  const board = new Board();
  const piece = pieceAt(2, 5);
  assert.deepEqual(piece.childCell(), { x: 2, y: 6 });
  piece.rotate(board, 1);
  assert.equal(piece.orientation, RIGHT);
  assert.deepEqual(piece.childCell(), { x: 3, y: 5 });
  piece.rotate(board, 1);
  assert.equal(piece.orientation, DOWN);
  piece.rotate(board, 1);
  assert.equal(piece.orientation, LEFT);
  piece.rotate(board, 1);
  assert.equal(piece.orientation, UP);
});

test('rotating into the right wall kicks the pair left', () => {
  const board = new Board();
  const piece = pieceAt(5, 5);
  assert.equal(piece.rotate(board, 1), 'kick');
  assert.equal(piece.orientation, RIGHT);
  assert.equal(piece.x, 4);
});

test('rotating into the left wall kicks the pair right', () => {
  const board = new Board();
  const piece = pieceAt(0, 5);
  assert.equal(piece.rotate(board, -1), 'kick');
  assert.equal(piece.orientation, LEFT);
  assert.equal(piece.x, 1);
});

test('rotating down into the floor lifts the pair (floor kick)', () => {
  const board = new Board();
  const piece = pieceAt(2, 0);
  assert.equal(piece.rotate(board, 1), 'rotate'); // to RIGHT, still fine
  assert.equal(piece.rotate(board, 1), 'kick'); // to DOWN, kicked up
  assert.equal(piece.orientation, DOWN);
  assert.equal(piece.y, 1);
});

test('quick turn flips the pair when both sides are walled in', () => {
  const board = new Board();
  // A one-wide shaft at column 2.
  for (let y = 0; y < 6; y += 1) {
    board.set(1, y, makePuyo(3));
    board.set(3, y, makePuyo(3));
  }
  const piece = pieceAt(2, 2, UP);
  const axisBefore = piece.axis;
  assert.equal(piece.rotate(board, 1), 'quickturn');
  assert.equal(piece.orientation, DOWN);
  assert.equal(piece.y, 3);
  assert.deepEqual(piece.childCell(), { x: 2, y: 2 });
  assert.equal(piece.axis, axisBefore, 'the caller decides whether to swap');
});

test('a blocked rotation with a blocked kick is refused', () => {
  const board = new Board();
  for (let y = 0; y < 8; y += 1) board.set(3, y, makePuyo(3));
  board.set(1, 5, makePuyo(3));
  const piece = pieceAt(2, 5, UP);
  // Right is blocked, the left kick square is blocked, and a quick turn needs
  // the square above -- which is free, so the flip succeeds instead.
  const result = piece.rotate(board, 1);
  assert.equal(result, 'quickturn');
});

test('drop distance stops on top of a stack', () => {
  const board = new Board();
  board.set(2, 0, makePuyo(1));
  board.set(2, 1, makePuyo(1));
  const piece = pieceAt(2, 8);
  assert.equal(piece.dropDistance(board), 6);
});

test('locking a sideways pair writes both squares', () => {
  const board = new Board();
  const piece = pieceAt(2, 0, RIGHT);
  piece.lockInto(board);
  assert.equal(board.get(2, 0).color, 1);
  assert.equal(board.get(3, 0).color, 2);
});

test('locking a vertical pair keeps the axis below the child', () => {
  const board = new Board();
  const piece = pieceAt(2, 0, UP);
  piece.lockInto(board);
  assert.equal(board.get(2, 0).color, 1);
  assert.equal(board.get(2, 1).color, 2);
});
