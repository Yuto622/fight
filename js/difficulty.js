/* 難易度 / Difficulty presets.
 * 落下速度だけでなく、WORD モード側の作りやすさ（最短文字数・母音の出やすさ・
 * 引き直し代）と見返り（コイン倍率）もまとめて変える。 */
(function (global) {
  'use strict';

  var LEVELS = {
    easy: {
      key: 'easy', name: 'EASY', jp: 'やさしい',
      gravityScale: 0.5,     // 落下間隔の倍率（大きいほど速い）
      lockDelay: 800,        // 接地してから固定されるまで(ms)
      nextCount: 5,          // NEXT の表示数
      ghost: true,
      startLevel: 1,
      minWordLength: 3,      // 成立する単語の最短文字数
      vowelBias: 1.7,        // 母音の出やすさ（1が標準）
      rerollCost: 8,
      coinMult: 0.8,
      scoreMult: 0.8,
      note: '落下がゆっくりで、固定までの猶予も長い。母音が多く出るので単語を作りやすい。'
    },
    normal: {
      key: 'normal', name: 'NORMAL', jp: 'ふつう',
      gravityScale: 1, lockDelay: 500, nextCount: 5, ghost: true, startLevel: 1,
      minWordLength: 3, vowelBias: 1, rerollCost: 15, coinMult: 1, scoreMult: 1,
      note: 'ガイドライン標準。落下速度もロックディレイも本家どおり。'
    },
    hard: {
      key: 'hard', name: 'HARD', jp: 'むずかしい',
      gravityScale: 1.6, lockDelay: 400, nextCount: 3, ghost: true, startLevel: 3,
      minWordLength: 3, vowelBias: 0.85, rerollCost: 25, coinMult: 1.4, scoreMult: 1.3,
      note: 'レベル3スタート。NEXT は3個まで。そのぶんコインとスコアの倍率が上がる。'
    },
    expert: {
      key: 'expert', name: 'EXPERT', jp: '鬼', 
      gravityScale: 2.4, lockDelay: 250, nextCount: 1, ghost: false, startLevel: 5,
      minWordLength: 4, vowelBias: 0.7, rerollCost: 40, coinMult: 2, scoreMult: 1.8,
      note: 'レベル5スタート、ゴーストなし、NEXT は1個。単語は4文字以上でないと成立しない。'
    }
  };

  var ORDER = ['easy', 'normal', 'hard', 'expert'];

  global.Difficulty = {
    ORDER: ORDER,
    LEVELS: LEVELS,
    get: function (key) { return LEVELS[key] || LEVELS.normal; },
    /* 難易度ごとの差分を表示用にまとめる */
    summary: function (key, mode) {
      var d = this.get(key);
      var rows = [
        ['落下速度', '×' + d.gravityScale],
        ['開始レベル', 'Lv ' + d.startLevel],
        ['ロックディレイ', d.lockDelay + ' ms'],
        ['NEXT', d.nextCount + ' 個'],
        ['ゴースト', d.ghost ? 'あり' : 'なし']
      ];
      if (mode === 'word') {
        rows.push(['成立する単語', d.minWordLength + ' 文字以上']);
        rows.push(['母音の出やすさ', '×' + d.vowelBias]);
        rows.push(['引き直し', '◉ ' + d.rerollCost]);
        rows.push(['コイン倍率', '×' + d.coinMult]);
      } else {
        rows.push(['スコア倍率', '×' + d.scoreMult]);
      }
      return rows;
    }
  };
})(window);
