import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, PHASE } from '../src/core/game.js';
import { ColorRule } from '../src/core/rules/colorRule.js';
import { PuyoAi, AI_LEVELS } from '../src/core/ai.js';
import { Rng } from '../src/core/rng.js';
import { Board } from '../src/core/board.js';
import { applyPlacement, resolveBoard } from '../src/core/simulate.js';

test('shapeOf counts buried holes and surface bumpiness', () => {
  const board = Board.fromStrings([
    '1.....',
    '......',
    '1.....',
  ]);
  const shape = PuyoAi.shapeOf(board);
  assert.equal(shape.heights[0], 3);
  assert.equal(shape.holes, 1, 'the gap under the top puyo is a hole');
  assert.equal(shape.maxHeight, 3);
  assert.equal(shape.bumpiness, 3);
});

test('the CPU cashes in a chain once it meets its target', () => {
  const game = new Game({ rule: new ColorRule(), seed: 3 });
  // Four 1s under three 2s. Putting a 2 in column 1 pops the 1s, drops the
  // 2s together and takes the group with it: a two-chain.
  game.board = Board.fromStrings([
    '2.....',
    '2.....',
    '2.....',
    '1.....',
    '1.....',
    '1.....',
    '1.....',
  ]);
  game.piece.axis.color = 2;
  game.piece.child.color = 2;

  // Easy holds out for a two-chain, which is exactly what is on offer.
  const ai = new PuyoAi(game, { level: 'easy' });
  const plan = ai.decide();
  assert.ok(plan, 'the CPU should always find somewhere to play');

  const pair = { axis: game.piece.axis, child: game.piece.child };
  const landed = applyPlacement(game.board, pair, plan);
  assert.ok(landed, 'the chosen placement must be legal');
  assert.ok(
    resolveBoard(landed, game.rule).chain >= 2,
    `plan ${JSON.stringify(plan)} left the chain on the table`,
  );
});

test('every difficulty keeps the CPU alive for a good while', () => {
  for (const level of Object.keys(AI_LEVELS)) {
    const game = new Game({ rule: new ColorRule(), seed: 42 });
    const ai = new PuyoAi(game, { level, rng: new Rng(7) });
    const dt = 1 / 60;
    for (let frame = 0; frame < 60 * 120 && !game.isOver; frame += 1) {
      ai.update(dt);
      game.update(dt);
    }
    assert.ok(game.piecesPlaced > 40, `${level} placed only ${game.piecesPlaced} pairs`);
    assert.ok(game.score > 0, `${level} never scored`);
  }
});

test('a stronger CPU holds out for deeper chains', () => {
  const play = (level) => {
    const game = new Game({ rule: new ColorRule(), seed: 2024 });
    const ai = new PuyoAi(game, { level, rng: new Rng(11) });
    const dt = 1 / 60;
    for (let frame = 0; frame < 60 * 180 && !game.isOver; frame += 1) {
      ai.update(dt);
      game.update(dt);
    }
    return game;
  };
  const easy = play('easy');
  const normal = play('normal');
  assert.ok(
    normal.maxChain > easy.maxChain,
    `normal ${normal.maxChain} should out-chain easy ${easy.maxChain}`,
  );
});

test('the CPU stands down while the board is resolving', () => {
  const game = new Game({ rule: new ColorRule(), seed: 5 });
  const ai = new PuyoAi(game, { level: 'normal' });
  ai.update(1 / 60);
  assert.ok(ai.plan, 'it plans while a pair is falling');
  game.phase = PHASE.POPPING;
  ai.update(1 / 60);
  assert.equal(ai.plan, null);
});
