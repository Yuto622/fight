/* テトリミノの形状・色・SRS（Super Rotation System）キックテーブル
 * Tetromino shapes, colours and the guideline SRS wall-kick data.
 * 画面座標系（y は下向き）で保持している。 */
(function (global) {
  'use strict';

  // 各ミノは「size x size の箱」の中のセル座標で定義する（スポーン状態）。
  var BASE = {
    I: { size: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]], color: '#22d3ee', dark: '#0e7490' },
    J: { size: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]], color: '#3b82f6', dark: '#1d4ed8' },
    L: { size: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]], color: '#f97316', dark: '#c2410c' },
    O: { size: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]], color: '#facc15', dark: '#a16207' },
    S: { size: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]], color: '#22c55e', dark: '#15803d' },
    T: { size: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]], color: '#a855f7', dark: '#7e22ce' },
    Z: { size: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]], color: '#ef4444', dark: '#b91c1c' }
  };

  var TYPES = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

  // 時計回り回転: (x, y) -> (size - 1 - y, x)
  function rotateCells(cells, size) {
    return cells.map(function (c) { return [size - 1 - c[1], c[0]]; });
  }

  var PIECES = {};
  TYPES.forEach(function (type) {
    var base = BASE[type];
    var states = [base.cells];
    for (var i = 1; i < 4; i++) states.push(rotateCells(states[i - 1], base.size));
    PIECES[type] = {
      type: type,
      size: base.size,
      color: base.color,
      dark: base.dark,
      states: states
    };
  });

  // SRS キックテーブル（原典は y 上向き表記。ここでは y を反転して保持）
  function flip(table) {
    var out = {};
    Object.keys(table).forEach(function (k) {
      out[k] = table[k].map(function (o) { return [o[0], -o[1]]; });
    });
    return out;
  }

  var KICKS_JLSTZ = flip({
    '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]]
  });

  var KICKS_I = flip({
    '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
    '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]]
  });

  // 180度回転はガイドライン外。現代作品でよく使われる簡易テーブルを用いる。
  var KICKS_180 = [[0, 0], [1, 0], [-1, 0], [2, 0], [-2, 0], [0, -1], [1, -1], [-1, -1], [0, 1]];

  function kicksFor(type, from, to) {
    if (type === 'O') return [[0, 0]];
    if ((from + 2) % 4 === to) return KICKS_180;
    var key = from + '>' + to;
    return (type === 'I' ? KICKS_I : KICKS_JLSTZ)[key] || [[0, 0]];
  }

  global.Tetromino = {
    TYPES: TYPES,
    PIECES: PIECES,
    kicksFor: kicksFor,
    spawnX: function (type) { return type === 'O' ? 4 : 3; }
  };
})(window);
