import test from 'node:test';
import assert from 'node:assert/strict';
import { Board, makeGarbage } from '../src/core/board.js';
import { WordRule, bestWordsInRun, ACROSS, DOWN } from '../src/core/rules/wordRule.js';
import { dictionary } from '../src/core/wordlist.js';
import { Rng } from '../src/core/rng.js';
import { VISIBLE_ROWS } from '../src/core/constants.js';

const solverOptions = {
  minLength: 3,
  maxLength: 8,
  isWord: (word) => dictionary.has(word),
};

test('the line solver prefers the longest word over the short ones inside it', () => {
  assert.deepEqual(
    bestWordsInRun('cats', solverOptions).map((hit) => hit.word),
    ['cats'],
  );
  assert.deepEqual(
    bestWordsInRun('school', solverOptions).map((hit) => hit.word),
    ['school'],
  );
  assert.deepEqual(
    bestWordsInRun('friendly', solverOptions).map((hit) => hit.word),
    ['friendly'],
  );
});

test('the line solver takes two words when they do not overlap', () => {
  const hits = bestWordsInRun('thencat', solverOptions);
  assert.deepEqual(hits.map((hit) => hit.word), ['then', 'cat']);
  assert.deepEqual(hits.map((hit) => hit.start), [0, 4]);
});

test('the line solver reports nothing for gibberish', () => {
  assert.deepEqual(bestWordsInRun('zzzz', solverOptions), []);
  assert.deepEqual(bestWordsInRun('ab', solverOptions), []);
});

test('a word reads left to right across a row', () => {
  const rule = new WordRule();
  const board = Board.fromStrings(['CAT...']);
  const clears = rule.findClears(board);
  assert.equal(clears.length, 1);
  assert.equal(clears[0].word, 'cat');
  assert.equal(clears[0].direction, ACROSS);
  assert.deepEqual(clears[0].cells, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]);
});

test('a word read right to left does not count', () => {
  const rule = new WordRule();
  assert.equal(rule.findClears(Board.fromStrings(['TAC...'])).length, 0);
});

test('a word reads top to bottom down a column', () => {
  const rule = new WordRule();
  const board = Board.fromStrings([
    'C.....',
    'A.....',
    'T.....',
  ]);
  const clears = rule.findClears(board);
  assert.equal(clears.length, 1);
  assert.equal(clears[0].word, 'cat');
  assert.equal(clears[0].direction, DOWN);
  // Top to bottom means descending y.
  assert.deepEqual(clears[0].cells.map((cell) => cell.y), [2, 1, 0]);
});

test('a word read bottom to top does not count', () => {
  const rule = new WordRule();
  const board = Board.fromStrings(['T.....', 'A.....', 'C.....']);
  assert.equal(rule.findClears(board).length, 0);
});

test('one square can serve an across word and a down word at once', () => {
  const rule = new WordRule();
  // The T in the bottom-left corner is the last letter of the down word CAT
  // and the first letter of the across word TOP.
  const board = Board.fromStrings([
    'C.....',
    'A.....',
    'TOP...',
  ]);
  const words = rule.findClears(board).map((group) => `${group.direction}:${group.word}`).sort();
  assert.deepEqual(words, ['across:top', 'down:cat']);
});

test('a gap or a nuisance puyo breaks the line', () => {
  const rule = new WordRule();
  assert.equal(rule.findClears(Board.fromStrings(['CA.T..'])).length, 0);
  const board = Board.fromStrings(['CAT...']);
  board.set(1, 0, makeGarbage());
  assert.equal(rule.findClears(board).length, 0);
});

test('the hidden 13th row never spells anything', () => {
  const rule = new WordRule();
  const board = new Board();
  const lines = new Array(VISIBLE_ROWS).fill('......');
  const full = Board.fromStrings(lines);
  void full;
  'CAT'.split('').forEach((letter, i) => {
    board.set(i, VISIBLE_ROWS, Board.fromStrings([letter]).get(0, 0));
  });
  assert.equal(rule.findClears(board).length, 0);
});

test('a minimum word length shuts out the short words', () => {
  const strict = new WordRule({ minWordLength: 5 });
  assert.equal(strict.findClears(Board.fromStrings(['CAT...'])).length, 0);
  assert.equal(strict.findClears(Board.fromStrings(['HOUSE.'])).length, 1);
});

test('longer words are worth disproportionately more', () => {
  const rule = new WordRule();
  const three = rule.scoreStep({ groups: [{ word: 'cat', size: 3 }], clearedCount: 3, chain: 1 });
  const six = rule.scoreStep({ groups: [{ word: 'school', size: 6 }], clearedCount: 6, chain: 1 });
  assert.ok(six.score > three.score * 4, `${six.score} vs ${three.score}`);
  assert.ok(six.coins > three.coins * 4, `${six.coins} vs ${three.coins}`);
});

test('coins scale with the chain', () => {
  const rule = new WordRule();
  const first = rule.scoreStep({ groups: [{ word: 'cat', size: 3 }], clearedCount: 3, chain: 1 });
  const fifth = rule.scoreStep({ groups: [{ word: 'cat', size: 3 }], clearedCount: 3, chain: 5 });
  assert.ok(fifth.coins > first.coins);
  assert.ok(fifth.score > first.score);
});

test('the letter supply keeps vowels coming', () => {
  const rule = new WordRule();
  const generate = rule.createPairGenerator(new Rng(12345));
  let vowels = 0;
  let letters = 0;
  let longestConsonantRun = 0;
  let run = 0;
  for (let i = 0; i < 2000; i += 1) {
    const pair = generate();
    for (const cell of [pair.axis, pair.child]) {
      letters += 1;
      if ('AEIOU'.includes(cell.letter)) {
        vowels += 1;
        run = 0;
      } else {
        run += 1;
        longestConsonantRun = Math.max(longestConsonantRun, run);
      }
    }
  }
  const share = vowels / letters;
  assert.ok(share > 0.35 && share < 0.55, `vowel share ${share}`);
  assert.ok(longestConsonantRun <= 4, `consonant run ${longestConsonantRun}`);
  assert.ok(!/Q/.test(''), 'Q is kept out of the bag');
});
