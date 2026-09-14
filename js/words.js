/* 単語モードのロジック / Word-mode logic.
 * 文字袋（letter bag）・盤面の単語検出・U-Speak コインの計算をまとめる。 */
(function (global) {
  'use strict';

  var MIN_LEN = 3;
  var MAX_LEN = 8;

  // ---- 辞書 -------------------------------------------------------------
  var DICT = new Set();
  var BY_LEN = {};
  (function buildDictionary() {
    var data = global.USPEAK_WORD_DATA || {};
    Object.keys(data).forEach(function (len) {
      var list = data[len].split(' ').filter(Boolean);
      BY_LEN[len] = list;
      for (var i = 0; i < list.length; i++) DICT.add(list[i]);
    });
  })();

  function isWord(s) { return s.length >= MIN_LEN && DICT.has(s); }
  function meaningOf(word) { return (global.USPEAK_MEANINGS || {})[word] || ''; }

  // ---- 文字袋 -----------------------------------------------------------
  // 英語の出現頻度をもとに、母音をやや多めにした重み付け分布。
  var WEIGHTS = {
    a: 90, b: 22, c: 42, d: 46, e: 118, f: 24, g: 26, h: 34, i: 82, j: 4,
    k: 14, l: 52, m: 30, n: 66, o: 80, p: 32, q: 3, r: 68, s: 70, t: 76,
    u: 42, v: 12, w: 18, x: 4, y: 26, z: 4
  };
  var VOWELS = ['a', 'e', 'i', 'o', 'u'];

  // Scrabble 準拠の文字点数（得点計算の基礎）
  var VALUES = {
    a: 1, b: 3, c: 3, d: 2, e: 1, f: 4, g: 2, h: 4, i: 1, j: 8, k: 5, l: 1, m: 3,
    n: 1, o: 1, p: 3, q: 10, r: 1, s: 1, t: 1, u: 1, v: 4, w: 4, x: 8, y: 4, z: 10
  };

  var pool = [];
  Object.keys(WEIGHTS).forEach(function (ch) {
    for (var i = 0; i < WEIGHTS[ch]; i++) pool.push(ch);
  });

  function randomLetter() { return pool[(Math.random() * pool.length) | 0]; }
  function randomVowel() {
    var bag = [];
    VOWELS.forEach(function (v) { for (var i = 0; i < WEIGHTS[v]; i++) bag.push(v); });
    return bag[(Math.random() * bag.length) | 0];
  }

  /* 1ミノ分（4文字）を引く。母音が 0 個なら 1 つ差し替え、
   * 母音が 4 個なら子音を 1 つ混ぜて、単語を作りやすい配分に整える。 */
  function drawLetters(count) {
    var n = count || 4;
    var out = [];
    for (var i = 0; i < n; i++) out.push(randomLetter());
    var vowels = out.filter(function (c) { return VOWELS.indexOf(c) >= 0; }).length;
    if (vowels === 0) out[(Math.random() * n) | 0] = randomVowel();
    if (vowels === n) {
      var idx = (Math.random() * n) | 0;
      var c;
      do { c = randomLetter(); } while (VOWELS.indexOf(c) >= 0);
      out[idx] = c;
    }
    return out;
  }

  // ---- 盤面の単語検出 ---------------------------------------------------
  /* 連続して埋まっているマスの並びから、長い単語を優先して切り出す。
   * 同じ並びの中では重ならないように取るが、横の単語と縦の単語は
   * 同じマスを共有してよい（クロスワードと同じ考え方）。 */
  function scanRun(run) {
    var found = [];
    var i = 0;
    while (i <= run.length - MIN_LEN) {
      var matched = 0;
      var max = Math.min(MAX_LEN, run.length - i);
      for (var len = max; len >= MIN_LEN; len--) {
        var s = '';
        for (var k = 0; k < len; k++) s += run[i + k].letter;
        if (isWord(s)) {
          found.push({ word: s, cells: run.slice(i, i + len).map(function (c) { return [c.r, c.c]; }) });
          matched = len;
          break;
        }
      }
      i += matched || 1;
    }
    return found;
  }

  function collectRuns(cellsInLine) {
    var runs = [];
    var cur = [];
    for (var i = 0; i < cellsInLine.length; i++) {
      var cell = cellsInLine[i];
      if (cell && cell.letter) {
        cur.push(cell);
      } else {
        if (cur.length >= MIN_LEN) runs.push(cur);
        cur = [];
      }
    }
    if (cur.length >= MIN_LEN) runs.push(cur);
    return runs;
  }

  /* board: board[r][c] = null | {type, letter}
   * 戻り値: [{word, cells, dir}] */
  function findWords(board, rows, cols) {
    var results = [];
    var r, c, line;

    for (r = 0; r < rows; r++) {
      line = [];
      for (c = 0; c < cols; c++) {
        var cell = board[r][c];
        line.push(cell ? { letter: cell.letter, r: r, c: c } : null);
      }
      collectRuns(line).forEach(function (run) {
        scanRun(run).forEach(function (w) { w.dir = 'h'; results.push(w); });
      });
    }

    for (c = 0; c < cols; c++) {
      line = [];
      for (r = 0; r < rows; r++) {
        var cell2 = board[r][c];
        line.push(cell2 ? { letter: cell2.letter, r: r, c: c } : null);
      }
      collectRuns(line).forEach(function (run) {
        scanRun(run).forEach(function (w) { w.dir = 'v'; results.push(w); });
      });
    }

    return results;
  }

  // ---- 得点 -------------------------------------------------------------
  // 長い単語ほど一気に伸びる倍率。3文字=1倍、8文字=20倍。
  var LENGTH_MULT = { 3: 1, 4: 2.5, 5: 5, 6: 9, 7: 14, 8: 20 };

  function letterValue(word) {
    var sum = 0;
    for (var i = 0; i < word.length; i++) sum += VALUES[word[i]] || 1;
    return sum;
  }

  function chainMultiplier(chain) {
    if (chain <= 1) return 1;
    if (chain === 2) return 1.5;
    if (chain === 3) return 2;
    if (chain === 4) return 3;
    return 4;
  }

  /* 1単語あたりの U-Speak コイン */
  function coinsFor(word, chain) {
    var mult = LENGTH_MULT[word.length] || 20;
    return Math.max(1, Math.round(letterValue(word) * mult * chainMultiplier(chain)));
  }

  global.Words = {
    MIN_LEN: MIN_LEN,
    MAX_LEN: MAX_LEN,
    size: function () { return DICT.size; },
    isWord: isWord,
    meaningOf: meaningOf,
    drawLetters: drawLetters,
    findWords: findWords,
    coinsFor: coinsFor,
    letterValue: letterValue,
    lengthMultiplier: function (len) { return LENGTH_MULT[len] || 20; },
    chainMultiplier: chainMultiplier
  };
})(window);
