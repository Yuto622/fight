/* テトリスのルール本体 / Core Tetris rules.
 * ガイドライン準拠: 10x20 の可視フィールド、SRS 回転とウォールキック、
 * 7-bag ランダマイザ、ホールド、ゴースト、ロックディレイ（15回まで再設定）、
 * T-Spin 判定、B2B、コンボ、パーフェクトクリア、レベル別落下速度。
 *
 * モード 'word' では、確定したブロックが持つ文字から英単語を探して消す。
 * 消えた後は列ごとに落下し、連鎖（チェイン）が起きる。 */
(function (global) {
  'use strict';

  var T = global.Tetromino;

  var COLS = 10;
  var ROWS = 22;      // 上2行は見えないスポーン領域
  var HIDDEN = 2;
  var NEXT_COUNT = 5;

  var LOCK_DELAY = 500;     // ms（難易度で上書きされる既定値）
  var MAX_LOCK_RESETS = 15;
  var CLEAR_ANIM = 240;     // ms（ライン／単語の消去演出）
  var ENTRY_DELAY = 80;     // ms（ARE）

  var LINE_SCORE = [0, 100, 300, 500, 800];
  var TSPIN_SCORE = [400, 800, 1200, 1600];
  var TSPIN_MINI_SCORE = [100, 200, 400];
  var PERFECT_SCORE = [0, 800, 1200, 1800, 2000];

  // ガイドラインの落下速度: (0.8 - (level-1)*0.007)^(level-1) 秒/マス
  function gravityMs(level) {
    var l = Math.min(level, 20);
    return Math.pow(0.8 - (l - 1) * 0.007, l - 1) * 1000;
  }

  function makeBoard() {
    var b = [];
    for (var r = 0; r < ROWS; r++) {
      var row = [];
      for (var c = 0; c < COLS; c++) row.push(null);
      b.push(row);
    }
    return b;
  }

  function Engine(opts) {
    opts = opts || {};
    this.emit = opts.onEvent || function () {};
    this.cols = COLS;
    this.rows = ROWS;
    this.hidden = HIDDEN;
    this.nextCount = NEXT_COUNT;
    this.mode = opts.mode || 'classic';
    this.diff = opts.difficulty || global.Difficulty.get('normal');
    this.startLevel = opts.startLevel || this.diff.startLevel;
    this.reset(this.mode, this.startLevel, this.diff);
  }

  Engine.prototype.reset = function (mode, startLevel, difficulty) {
    if (mode) this.mode = mode;
    if (difficulty) this.diff = difficulty;
    this.startLevel = startLevel || this.diff.startLevel;
    this.nextCount = this.diff.nextCount;

    this.board = makeBoard();
    this.bag = [];
    this.queue = [];
    this.active = null;
    this.hold = null;
    this.holdUsed = false;

    this.score = 0;
    this.lines = 0;
    this.level = this.startLevel;
    this.combo = -1;
    this.backToBack = false;
    this.pieces = 0;
    this.startedAt = 0;
    this.elapsed = 0;

    // 単語モード用
    this.coins = 0;
    this.wordLog = [];
    this.wordCount = 0;
    this.bestWord = null;
    this.longestChain = 0;

    this.phase = 'ready';   // ready / falling / clearing / entry / over
    this.gravityAcc = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.grounded = false;
    this.clearTimer = 0;
    this.entryTimer = 0;
    this.pending = null;
    this.clearingCells = [];
    this.chain = 0;
    this.pieceClearedLines = 0;
    this.softDropping = false;
    this.lastActionRotate = false;
    this.lastKickIndex = 0;
    this.resolveFirstStep = true;
    this.pendingTSpin = null;

    for (var i = 0; i < this.nextCount; i++) this.queue.push(this.nextFromBag());
  };

  Engine.prototype.start = function () {
    this.phase = 'falling';
    this.startedAt = performance.now();
    this.spawn();
  };

  // ---- 7-bag ------------------------------------------------------------
  Engine.prototype.nextFromBag = function () {
    if (!this.bag.length) {
      this.bag = T.TYPES.slice();
      for (var i = this.bag.length - 1; i > 0; i--) {
        var j = (Math.random() * (i + 1)) | 0;
        var t = this.bag[i]; this.bag[i] = this.bag[j]; this.bag[j] = t;
      }
    }
    var type = this.bag.pop();
    return {
      type: type,
      letters: this.mode === 'word' ? global.Words.drawLetters(4, this.diff.vowelBias) : null
    };
  };

  Engine.prototype.makePiece = function (spec) {
    return {
      type: spec.type,
      letters: spec.letters,
      rot: 0,
      x: T.spawnX(spec.type),
      y: 0
    };
  };

  Engine.prototype.cellsOf = function (piece, rot, x, y) {
    var def = T.PIECES[piece.type];
    var state = def.states[(rot === undefined ? piece.rot : rot)];
    var px = (x === undefined ? piece.x : x);
    var py = (y === undefined ? piece.y : y);
    var out = [];
    for (var i = 0; i < state.length; i++) {
      out.push({
        c: px + state[i][0],
        r: py + state[i][1],
        letter: piece.letters ? piece.letters[i] : null,
        index: i
      });
    }
    return out;
  };

  Engine.prototype.collides = function (piece, rot, x, y) {
    var cells = this.cellsOf(piece, rot, x, y);
    for (var i = 0; i < cells.length; i++) {
      var cell = cells[i];
      if (cell.c < 0 || cell.c >= COLS || cell.r >= ROWS) return true;
      if (cell.r < 0) continue;
      if (this.board[cell.r][cell.c]) return true;
    }
    return false;
  };

  Engine.prototype.spawn = function (spec) {
    var piece = this.makePiece(spec || this.queue.shift());
    if (!spec) this.queue.push(this.nextFromBag());

    if (this.collides(piece, piece.rot, piece.x, piece.y)) {
      this.active = piece;
      this.gameOver('block out');
      return;
    }
    // ガイドライン: 出現後、ぶつからなければ即1マス下へ
    if (!this.collides(piece, piece.rot, piece.x, piece.y + 1)) piece.y += 1;

    this.active = piece;
    this.gravityAcc = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.grounded = false;
    this.lastActionRotate = false;
    this.pieces++;
    this.phase = 'falling';
    this.emit('spawn', { piece: piece });
  };

  Engine.prototype.gameOver = function (reason) {
    this.phase = 'over';
    this.emit('gameover', {
      reason: reason,
      difficulty: this.diff.key,
      score: this.score,
      lines: this.lines,
      level: this.level,
      coins: this.coins,
      words: this.wordCount,
      bestWord: this.bestWord,
      elapsed: this.elapsed
    });
  };

  // ---- 操作 -------------------------------------------------------------
  Engine.prototype.canAct = function () {
    return this.phase === 'falling' && this.active;
  };

  Engine.prototype.move = function (dx) {
    if (!this.canAct()) return false;
    var p = this.active;
    if (this.collides(p, p.rot, p.x + dx, p.y)) return false;
    p.x += dx;
    this.lastActionRotate = false;
    this.onPieceMoved();
    this.emit('move', {});
    return true;
  };

  Engine.prototype.rotate = function (dir) { // 1=CW, -1=CCW, 2=180
    if (!this.canAct()) return false;
    var p = this.active;
    var to = ((p.rot + dir) % 4 + 4) % 4;
    var kicks = T.kicksFor(p.type, p.rot, to);
    for (var i = 0; i < kicks.length; i++) {
      var nx = p.x + kicks[i][0];
      var ny = p.y + kicks[i][1];
      if (!this.collides(p, to, nx, ny)) {
        p.rot = to; p.x = nx; p.y = ny;
        this.lastActionRotate = true;
        this.lastKickIndex = i;
        this.onPieceMoved();
        this.emit('rotate', { kick: i });
        return true;
      }
    }
    return false;
  };

  Engine.prototype.onPieceMoved = function () {
    // 接地中に動かせたらロックディレイを再設定（上限あり）
    if (this.grounded && this.lockResets < MAX_LOCK_RESETS) {
      this.lockTimer = 0;
      this.lockResets++;
    }
    var p = this.active;
    this.grounded = this.collides(p, p.rot, p.x, p.y + 1);
    if (!this.grounded) this.lockTimer = 0;
  };

  Engine.prototype.softDrop = function () {
    if (!this.canAct()) return false;
    var p = this.active;
    if (this.collides(p, p.rot, p.x, p.y + 1)) return false;
    p.y += 1;
    this.score += 1;
    this.lastActionRotate = false;
    this.grounded = this.collides(p, p.rot, p.x, p.y + 1);
    this.lockTimer = 0;
    return true;
  };

  Engine.prototype.hardDrop = function () {
    if (!this.canAct()) return false;
    var p = this.active;
    var dist = 0;
    while (!this.collides(p, p.rot, p.x, p.y + 1)) { p.y += 1; dist++; }
    this.score += dist * 2;
    this.lastActionRotate = this.lastActionRotate && dist === 0;
    this.emit('harddrop', { distance: dist, piece: p });
    this.lockPiece();
    return true;
  };

  Engine.prototype.holdPiece = function () {
    if (!this.canAct() || this.holdUsed) return false;
    var current = { type: this.active.type, letters: this.active.letters };
    var swap = this.hold;
    this.hold = current;
    this.holdUsed = true;
    this.emit('hold', {});
    if (swap) this.spawn(swap);
    else this.spawn();
    return true;
  };

  /* 単語モード: 落下中のミノの文字を引き直す（コイン消費は呼び出し側で判定） */
  Engine.prototype.rerollLetters = function () {
    if (!this.canAct() || this.mode !== 'word' || !this.active.letters) return false;
    this.active.letters = global.Words.drawLetters(4, this.diff.vowelBias);
    this.emit('reroll', {});
    return true;
  };

  Engine.prototype.ghostY = function () {
    if (!this.active) return 0;
    var p = this.active;
    var y = p.y;
    while (!this.collides(p, p.rot, p.x, y + 1)) y++;
    return y;
  };

  // ---- 固定と消去 -------------------------------------------------------
  Engine.prototype.detectTSpin = function () {
    var p = this.active;
    if (p.type !== 'T' || !this.lastActionRotate) return null;
    var corners = [
      [p.x, p.y],         // 左上
      [p.x + 2, p.y],     // 右上
      [p.x, p.y + 2],     // 左下
      [p.x + 2, p.y + 2]  // 右下
    ];
    var self = this;
    var filled = corners.map(function (pt) {
      var c = pt[0], r = pt[1];
      if (c < 0 || c >= COLS || r >= ROWS) return true;
      if (r < 0) return false;
      return !!self.board[r][c];
    });
    var total = filled.filter(Boolean).length;
    if (total < 3) return null;
    var frontIdx = [[0, 1], [1, 3], [2, 3], [0, 2]][p.rot];
    var front = filled[frontIdx[0]] && filled[frontIdx[1]];
    if (front) return 'tspin';
    return this.lastKickIndex === 4 ? 'tspin' : 'mini';
  };

  Engine.prototype.lockPiece = function () {
    var p = this.active;
    var cells = this.cellsOf(p);
    var def = T.PIECES[p.type];
    var allHidden = true;

    this.pendingTSpin = this.detectTSpin();

    for (var i = 0; i < cells.length; i++) {
      var cell = cells[i];
      if (cell.r < 0) continue;
      if (cell.r >= HIDDEN) allHidden = false;
      this.board[cell.r][cell.c] = {
        type: p.type,
        color: def.color,
        dark: def.dark,
        letter: cell.letter
      };
    }

    this.emit('lock', { cells: cells, type: p.type });
    this.active = null;
    this.holdUsed = false;
    this.chain = 0;
    this.pieceClearedLines = 0;
    this.resolveFirstStep = true;

    if (allHidden) { this.gameOver('lock out'); return; }

    this.beginResolve();
  };

  /* 次に消すもの（単語 → ライン の順）を探す */
  Engine.prototype.findClear = function () {
    if (this.mode === 'word') {
      var words = global.Words.findWords(this.board, ROWS, COLS, this.diff.minWordLength);
      if (words.length) {
        var set = Object.create(null);
        var cells = [];
        words.forEach(function (w) {
          w.cells.forEach(function (rc) {
            var key = rc[0] + ':' + rc[1];
            if (!set[key]) { set[key] = true; cells.push(rc); }
          });
        });
        return { kind: 'words', words: words, cells: cells };
      }
    }
    var rows = [];
    for (var r = 0; r < ROWS; r++) {
      var full = true;
      for (var c = 0; c < COLS; c++) if (!this.board[r][c]) { full = false; break; }
      if (full) rows.push(r);
    }
    if (rows.length) {
      var lineCells = [];
      rows.forEach(function (rr) {
        for (var c2 = 0; c2 < COLS; c2++) lineCells.push([rr, c2]);
      });
      return { kind: 'lines', rows: rows, cells: lineCells };
    }
    return null;
  };

  Engine.prototype.beginResolve = function () {
    var step = this.findClear();
    if (!step) { this.finishResolve(); return; }
    this.chain++;
    if (this.chain > this.longestChain) this.longestChain = this.chain;
    this.pending = step;
    this.clearingCells = step.cells;
    this.clearTimer = CLEAR_ANIM;
    this.phase = 'clearing';
    if (step.kind === 'words') {
      this.emit('wordsfound', { words: step.words, chain: this.chain });
    } else {
      this.emit('linesfound', { rows: step.rows, chain: this.chain });
    }
  };

  Engine.prototype.applyStep = function (step) {
    if (step.kind === 'words') this.applyWordClear(step);
    else this.applyLineClear(step);
  };

  Engine.prototype.applyWordClear = function (step) {
    var self = this;
    var gained = 0;
    var entries = [];

    step.words.forEach(function (w) {
      var coins = Math.max(1, Math.round(global.Words.coinsFor(w.word, self.chain) * self.diff.coinMult));
      gained += coins;
      var entry = {
        word: w.word,
        length: w.word.length,
        coins: coins,
        chain: self.chain,
        meaning: global.Words.meaningOf(w.word),
        dir: w.dir
      };
      entries.push(entry);
      self.wordLog.unshift(entry);
      if (self.wordLog.length > 40) self.wordLog.pop();
      self.wordCount++;
      if (!self.bestWord || w.word.length > self.bestWord.length ||
          (w.word.length === self.bestWord.length && coins > self.bestWord.coins)) {
        self.bestWord = entry;
      }
    });

    this.coins += gained;
    this.score += gained * 10;

    step.cells.forEach(function (rc) { self.board[rc[0]][rc[1]] = null; });
    this.applyColumnGravity();

    this.emit('wordscored', { words: entries, coins: gained, chain: this.chain });
  };

  /* 単語消去のあとは列ごとに落ちる（連鎖のもと） */
  Engine.prototype.applyColumnGravity = function () {
    for (var c = 0; c < COLS; c++) {
      var stack = [];
      for (var r = ROWS - 1; r >= 0; r--) {
        if (this.board[r][c]) stack.push(this.board[r][c]);
      }
      for (var r2 = ROWS - 1, i = 0; r2 >= 0; r2--, i++) {
        this.board[r2][c] = i < stack.length ? stack[i] : null;
      }
    }
  };

  Engine.prototype.applyLineClear = function (step) {
    var n = step.rows.length;
    var tspin = this.resolveFirstStep ? this.pendingTSpin : null;
    var base;
    var difficult = false;
    var label = '';

    // 単語モードの連鎖では 5 行以上が同時に揃うことがあるので、表の範囲を超えても破綻させない
    if (tspin === 'tspin') {
      var ti = Math.min(n, 3);
      base = TSPIN_SCORE[ti];
      difficult = true;
      label = ['T-SPIN', 'T-SPIN SINGLE', 'T-SPIN DOUBLE', 'T-SPIN TRIPLE'][ti];
    } else if (tspin === 'mini') {
      var mi = Math.min(n, 2);
      base = TSPIN_MINI_SCORE[mi];
      difficult = n > 0;
      label = ['T-SPIN MINI', 'T-SPIN MINI SINGLE', 'T-SPIN MINI DOUBLE'][mi];
    } else if (n <= 4) {
      base = LINE_SCORE[n];
      difficult = n === 4;
      label = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'][n];
    } else {
      base = LINE_SCORE[4] + (n - 4) * LINE_SCORE[2];
      difficult = true;
      label = n + ' LINES';
    }

    var b2b = false;
    if (difficult && this.backToBack && n > 0) { base = Math.floor(base * 1.5); b2b = true; }
    if (n > 0) this.backToBack = difficult;

    var gained = Math.round(base * this.level * this.diff.scoreMult);

    // コンボ（1ミノにつき1回だけ加算）
    if (n > 0 && this.pieceClearedLines === 0) {
      this.combo++;
      if (this.combo > 0) gained += Math.round(50 * this.combo * this.level * this.diff.scoreMult);
    }
    this.pieceClearedLines += n;

    // 行を消して上を詰める
    var self = this;
    step.rows.sort(function (a, b) { return a - b; }).forEach(function (r) {
      self.board.splice(r, 1);
      var row = [];
      for (var c = 0; c < COLS; c++) row.push(null);
      self.board.unshift(row);
    });

    this.lines += n;
    var newLevel = Math.max(this.startLevel, Math.floor(this.lines / 10) + 1);
    var leveled = newLevel !== this.level;
    this.level = newLevel;

    // パーフェクトクリア
    var empty = true;
    for (var r2 = 0; r2 < ROWS && empty; r2++) {
      for (var c2 = 0; c2 < COLS; c2++) if (this.board[r2][c2]) { empty = false; break; }
    }
    var perfect = empty && n > 0;
    if (perfect) {
      var pc = (n >= 4 && b2b) ? 3200 : PERFECT_SCORE[Math.min(n, 4)];
      gained += Math.round(pc * this.level * this.diff.scoreMult);
    }

    this.score += gained;

    // 単語モードでもライン消去でコインが少し貯まる
    if (this.mode === 'word' && n > 0) {
      var lineCoins = Math.round(n * n * 5 * this.diff.coinMult);
      this.coins += lineCoins;
    }

    this.emit('linescored', {
      lines: n, label: label, score: gained, b2b: b2b, perfect: perfect,
      combo: this.combo, level: this.level, leveled: leveled, tspin: tspin
    });

    this.resolveFirstStep = false;
  };

  Engine.prototype.finishResolve = function () {
    if (this.pieceClearedLines === 0) this.combo = -1;
    this.pendingTSpin = null;
    this.phase = 'entry';
    this.entryTimer = ENTRY_DELAY;
  };

  // ---- メインループ -----------------------------------------------------
  Engine.prototype.update = function (dt) {
    if (this.phase === 'over' || this.phase === 'ready') return;
    this.elapsed += dt;

    if (this.phase === 'clearing') {
      this.clearTimer -= dt;
      if (this.clearTimer <= 0) {
        var step = this.pending;
        this.pending = null;
        this.clearingCells = [];
        this.applyStep(step);
        this.beginResolve();
      }
      return;
    }

    if (this.phase === 'entry') {
      this.entryTimer -= dt;
      if (this.entryTimer <= 0) this.spawn();
      return;
    }

    if (this.phase !== 'falling' || !this.active) return;

    var interval = gravityMs(this.level) / this.diff.gravityScale;
    if (this.softDropping) interval = Math.min(interval, Math.max(interval / 20, 12));

    this.gravityAcc += dt;
    while (this.gravityAcc >= interval && this.phase === 'falling') {
      this.gravityAcc -= interval;
      var p = this.active;
      if (!this.collides(p, p.rot, p.x, p.y + 1)) {
        p.y += 1;
        if (this.softDropping) this.score += 1;
        this.lastActionRotate = false;
        this.grounded = this.collides(p, p.rot, p.x, p.y + 1);
        if (!this.grounded) this.lockTimer = 0;
      } else {
        this.grounded = true;
        break;
      }
    }

    if (this.grounded) {
      this.lockTimer += dt;
      if (this.lockTimer >= this.diff.lockDelay) this.lockPiece();
    }
  };

  Engine.prototype.stats = function () {
    return {
      score: this.score, lines: this.lines, level: this.level,
      combo: this.combo, coins: this.coins, words: this.wordCount,
      pieces: this.pieces, elapsed: this.elapsed, bestWord: this.bestWord,
      b2b: this.backToBack, longestChain: this.longestChain
    };
  };

  Engine.COLS = COLS;
  Engine.ROWS = ROWS;
  Engine.HIDDEN = HIDDEN;
  Engine.gravityMs = gravityMs;
  global.TetrisEngine = Engine;
})(window);
