import test from 'node:test';
import assert from 'node:assert/strict';

/** A stand-in for the browser's localStorage, so the profile can be tested. */
class MemoryStorage {
  constructor() {
    this.map = new Map();
    this.failWrites = false;
  }

  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }

  setItem(key, value) {
    if (this.failWrites) throw new Error('QuotaExceededError');
    this.map.set(key, String(value));
  }

  removeItem(key) {
    this.map.delete(key);
  }
}

const storage = new MemoryStorage();
globalThis.window = { localStorage: storage };
const { profile } = await import('../src/storage.js');

test.beforeEach(() => {
  storage.map.clear();
  storage.failWrites = false;
});

test('a fresh profile starts empty', () => {
  const state = profile.load();
  assert.equal(state.coins, 0);
  assert.deepEqual(state.wordBook, {});
  assert.equal(state.settings.minWordLength, 3);
});

test('coins add up across games', () => {
  profile.record({ mode: 'uspeak', score: 100, coins: 12, maxChain: 2, words: [] });
  profile.record({ mode: 'uspeak', score: 50, coins: 8, maxChain: 1, words: [] });
  assert.equal(profile.coins(), 20);
});

test('only a higher score replaces the best', () => {
  assert.equal(profile.record({ mode: 'uspeak', score: 500, coins: 0, maxChain: 1 }).isBest, true);
  assert.equal(profile.record({ mode: 'uspeak', score: 300, coins: 0, maxChain: 1 }).isBest, false);
  assert.equal(profile.load().best.uspeak, 500);
});

test('high scores are kept per mode', () => {
  profile.record({ mode: 'uspeak', score: 500, coins: 0, maxChain: 1 });
  profile.record({ mode: 'classic', score: 90, coins: 0, maxChain: 1 });
  const state = profile.load();
  assert.equal(state.best.uspeak, 500);
  assert.equal(state.best.classic, 90);
  assert.equal(state.best.versus, 0);
});

test('the word book counts repeats and reports only the new words', () => {
  const first = profile.record({
    mode: 'uspeak',
    score: 10,
    coins: 1,
    maxChain: 1,
    words: [{ word: 'cat' }, { word: 'dog' }],
  });
  assert.deepEqual(first.newWords, ['cat', 'dog']);

  const second = profile.record({
    mode: 'uspeak',
    score: 10,
    coins: 1,
    maxChain: 1,
    words: [{ word: 'cat' }, { word: 'school' }],
  });
  assert.deepEqual(second.newWords, ['school']);
  assert.equal(profile.load().wordBook.cat, 2);
  assert.deepEqual(profile.wordBook(), ['school', 'cat', 'dog']);
});

test('versus results are tallied as wins and losses', () => {
  profile.record({ mode: 'versus', score: 1, coins: 0, maxChain: 1, won: true });
  profile.record({ mode: 'versus', score: 1, coins: 0, maxChain: 1, won: false });
  profile.record({ mode: 'uspeak', score: 1, coins: 0, maxChain: 1, won: null });
  const state = profile.load();
  assert.equal(state.wins, 1);
  assert.equal(state.losses, 1);
});

test('a corrupt profile falls back to defaults instead of throwing', () => {
  storage.map.set('puyo-uspeak/v1', '{not json');
  assert.equal(profile.load().coins, 0);
  storage.map.set('puyo-uspeak/v1', '{"coins":5,"wordBook":"nonsense"}');
  const state = profile.load();
  assert.equal(state.coins, 5);
  assert.deepEqual(state.wordBook, {});
});

test('a storage that refuses writes does not break the game', () => {
  storage.failWrites = true;
  assert.doesNotThrow(() => {
    profile.record({ mode: 'uspeak', score: 10, coins: 5, maxChain: 1, words: [{ word: 'cat' }] });
    profile.saveSettings({ level: 4 });
  });
});

test('clearing wipes everything', () => {
  profile.record({ mode: 'uspeak', score: 10, coins: 5, maxChain: 1, words: [{ word: 'cat' }] });
  profile.clear();
  assert.equal(profile.coins(), 0);
  assert.deepEqual(profile.wordBook(), []);
});
