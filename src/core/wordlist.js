import {
  WORD_BLOCKS,
  COMMON_WORD_BLOCKS,
  MIN_WORD_LENGTH,
  MAX_WORD_LENGTH,
} from '../data/dictionary.js';

/**
 * Unpacks the generated dictionary into lookup sets.
 *
 * The data file stores each length class as runs of fixed-width words, so
 * splitting is a slice loop rather than a regex.
 */
function unpack(blocks) {
  const words = new Set();
  for (const [key, chunks] of Object.entries(blocks)) {
    const length = Number(key);
    for (const chunk of chunks) {
      for (let i = 0; i + length <= chunk.length; i += length) {
        words.add(chunk.slice(i, i + length));
      }
    }
  }
  return words;
}

let all = null;
let common = null;

function ensureLoaded() {
  if (!all) {
    all = unpack(WORD_BLOCKS);
    common = unpack(COMMON_WORD_BLOCKS);
  }
}

/** The English word list the game scores against. */
export const dictionary = {
  get minLength() {
    return MIN_WORD_LENGTH;
  },
  get maxLength() {
    return MAX_WORD_LENGTH;
  },

  /** @returns {number} how many words are in the list. */
  get size() {
    ensureLoaded();
    return all.size;
  },

  /**
   * @param {string} word case-insensitive
   * @returns {boolean} true when the word scores.
   */
  has(word) {
    ensureLoaded();
    return all.has(word.toLowerCase());
  },

  /**
   * @param {string} word
   * @returns {boolean} true for everyday English (SCOWL tiers 10 and 20).
   *   The game calls these out so a learner can see which of their words are
   *   the ones worth remembering.
   */
  isCommon(word) {
    ensureLoaded();
    return common.has(word.toLowerCase());
  },
};
