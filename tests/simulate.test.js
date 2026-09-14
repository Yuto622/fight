import test from 'node:test';
import assert from 'node:assert/strict';
import { Board, makePuyo } from '../src/core/board.js';
import { resolveBoard, placements, applyPlacement } from '../src/core/simulate.js';
import { ColorRule } from '../src/core/rules/colorRule.js';
import { WordRule } from '../src/core/rules/wordRule.js';
import { COLS, UP, DOWN, RIGHT, LEFT } from '../src/core/constants.js';

test('resolveBoard plays a chain out to the end', () => {
  const board = Board.fromStrings([
    '2.....',
    '2.....',
    '2.....',
    '1.....',
    '1.....',
    '1.....',
    '12....',
  ]);
  const result = resolveBoard(board, new ColorRule());
  assert.equal(result.chain, 2);
  assert.equal(result.cleared, 8);
  assert.equal(result.score, 40 + 320);
  assert.ok(board.isClear());
});

test('resolveBoard leaves a quiet board alone', () => {
  const board = Board.fromStrings(['111...']);
  const result = resolveBoard(board, new ColorRule());
  assert.equal(result.chain, 0);
  assert.equal(board.count(), 3);
});

test('resolveBoard reports the words a word chain spelled', () => {
  const board = Board.fromStrings(['.AT...', 'CDOG..']);
  const result = resolveBoard(board, new WordRule());
  assert.deepEqual(result.words, ['dog', 'cat']);
  assert.equal(result.chain, 2);
});

test('there are 22 distinct ways to drop a pair on a six-wide field', () => {
  const options = placements(COLS);
  assert.equal(options.length, 22);
  assert.ok(!options.some((option) => option.orientation === RIGHT && option.x === COLS - 1));
  assert.ok(!options.some((option) => option.orientation === LEFT && option.x === 0));
});

test('a vertical placement stacks the axis under the child', () => {
  const pair = { axis: makePuyo(1), child: makePuyo(2) };
  const up = applyPlacement(new Board(), pair, { x: 3, orientation: UP });
  assert.equal(up.get(3, 0).color, 1);
  assert.equal(up.get(3, 1).color, 2);

  const down = applyPlacement(new Board(), pair, { x: 3, orientation: DOWN });
  assert.equal(down.get(3, 0).color, 2);
  assert.equal(down.get(3, 1).color, 1);
});

test('a sideways placement lets each half land on its own column', () => {
  const board = Board.fromStrings(['.1....', '.1....']);
  const pair = { axis: makePuyo(3), child: makePuyo(4) };
  const placed = applyPlacement(board, pair, { x: 0, orientation: RIGHT });
  assert.equal(placed.get(0, 0).color, 3, 'the axis falls to the floor');
  assert.equal(placed.get(1, 2).color, 4, 'the child rests on the stack');
});

test('placement does not disturb the board it was given', () => {
  const board = Board.fromStrings(['11....']);
  const before = board.toStrings().join('|');
  applyPlacement(board, { axis: makePuyo(1), child: makePuyo(1) }, { x: 0, orientation: UP });
  assert.equal(board.toStrings().join('|'), before);
});
