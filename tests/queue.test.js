import test from 'node:test';
import assert from 'node:assert/strict';
import { PairQueue } from '../src/core/queue.js';
import { Game } from '../src/core/game.js';
import { ColorRule } from '../src/core/rules/colorRule.js';

/** Hands out pairs labelled 0, 1, 2, ... so order is easy to assert on. */
function counter() {
  let next = 0;
  return () => {
    const id = next;
    next += 1;
    return { axis: { id }, child: { id }, id };
  };
}

test('the preview shows the pairs that are actually coming next', () => {
  const queue = new PairQueue(counter(), 2);
  const inPlay = queue.take();
  assert.equal(inPlay.id, 0);

  const preview = queue.preview();
  assert.deepEqual(preview.map((pair) => pair.id), [1, 2]);

  // Whatever sits at the front of the preview must be the very next pair out.
  assert.equal(queue.take().id, preview[0].id);
  assert.equal(queue.take().id, preview[1].id);
});

test('the preview rolls forward one place per pair taken', () => {
  const queue = new PairQueue(counter(), 2);
  queue.take();
  for (let i = 1; i <= 5; i += 1) {
    assert.deepEqual(queue.preview().map((pair) => pair.id), [i, i + 1]);
    queue.take();
  }
});

test('the preview keeps its length however many pairs are drawn', () => {
  const queue = new PairQueue(counter(), 3);
  for (let i = 0; i < 20; i += 1) {
    assert.equal(queue.preview().length, 3);
    queue.take();
  }
});

test('the pair the game spawns is the one the panel promised', () => {
  const game = new Game({ rule: new ColorRule(), seed: 77 });
  for (let i = 0; i < 12; i += 1) {
    // Spread the stack across the field so it does not top out mid-test.
    for (let step = 0; step < i % 5; step += 1) game.move(1);
    const promised = game.preview()[0];
    game.hardDrop();
    for (let step = 0; step < 2000 && !game.piece && !game.isOver; step += 1) {
      game.update(1 / 120);
    }
    assert.ok(game.piece, `no pair spawned after drop ${i}`);
    assert.equal(game.piece.axis.id, promised.axis.id, 'axis puyo differs from the preview');
    assert.equal(game.piece.child.id, promised.child.id, 'child puyo differs from the preview');
  }
});
