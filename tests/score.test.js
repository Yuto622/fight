import test from 'node:test';
import assert from 'node:assert/strict';
import { chainPower, colorBonus, groupBonus, scoreStep, scoreToGarbage } from '../src/core/score.js';

test('chain power matches the Tsu table and keeps climbing past it', () => {
  assert.equal(chainPower(1), 0);
  assert.equal(chainPower(2), 8);
  assert.equal(chainPower(5), 64);
  assert.equal(chainPower(10), 224);
  assert.equal(chainPower(24), 672);
  assert.equal(chainPower(25), 704);
});

test('colour and group bonuses match the Tsu tables', () => {
  assert.equal(colorBonus(1), 0);
  assert.equal(colorBonus(2), 3);
  assert.equal(colorBonus(5), 24);
  assert.equal(groupBonus(4), 0);
  assert.equal(groupBonus(7), 4);
  assert.equal(groupBonus(11), 10);
  assert.equal(groupBonus(30), 10);
});

test('known Tsu step scores', () => {
  // A lone four-puyo pop is 40 points because the multiplier floors at 1.
  assert.equal(scoreStep([{ size: 4, color: 0 }], 1, 4).score, 40);
  assert.equal(scoreStep([{ size: 4, color: 0 }], 2, 4).score, 320);
  assert.equal(scoreStep([{ size: 4, color: 0 }], 3, 4).score, 640);
  // Two colours at once on the first chain: 10 x 8 x (0 + 3).
  assert.equal(scoreStep([{ size: 4, color: 0 }, { size: 4, color: 1 }], 1, 8).score, 240);
  // A five-group on the first chain: 10 x 5 x (0 + 0 + 2).
  assert.equal(scoreStep([{ size: 5, color: 0 }], 1, 5).score, 100);
});

test('the multiplier is clamped to 999', () => {
  const groups = Array.from({ length: 20 }, (_, i) => ({ size: 11, color: i % 5 }));
  const result = scoreStep(groups, 30, 220);
  assert.equal(result.multiplier, 999);
});

test('garbage conversion carries its remainder', () => {
  assert.deepEqual(scoreToGarbage(140, 0), { garbage: 2, carry: 0 });
  assert.deepEqual(scoreToGarbage(100, 0), { garbage: 1, carry: 30 });
  assert.deepEqual(scoreToGarbage(60, 30), { garbage: 1, carry: 20 });
});
