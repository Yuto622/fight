/* 描画 / Canvas rendering.
 * 盤面・ゴースト・落下中のミノ・消去演出・NEXT・HOLD を描く。 */
(function (global) {
  'use strict';

  var CELL = 32;             // 論理サイズ（CSS 側で拡大縮小する）
  var RADIUS = 5;

  function roundRect(ctx, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function Renderer(canvas, holdCanvas, nextCanvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.holdCanvas = holdCanvas;
    this.holdCtx = holdCanvas.getContext('2d');
    this.nextCanvas = nextCanvas;
    this.nextCtx = nextCanvas.getContext('2d');
    this.showGhost = true;
    this.showLetters = true;
    this.shake = 0;
  }

  Renderer.prototype.resize = function (engine) {
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var visible = engine.rows - engine.hidden;
    sizeCanvas(this.canvas, engine.cols * CELL, visible * CELL, dpr);
    sizeCanvas(this.holdCanvas, 4 * CELL, 3 * CELL, dpr);
    sizeCanvas(this.nextCanvas, 3.4 * CELL, (engine.nextCount * 2.2 + 0.4) * CELL, dpr);

    // NEXT の表示数は難易度で変わるので、枠の高さも中身に合わせる
    var compact = (global.innerWidth || 1024) <= 760;
    var per = compact ? 40 : 54;
    this.holdCanvas.style.height = (compact ? 58 : 74) + 'px';
    this.nextCanvas.style.height = Math.min(engine.nextCount * per + 14, compact ? 160 : 320) + 'px';
    this.dpr = dpr;
  };

  function sizeCanvas(canvas, w, h, dpr) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.aspectRatio = w + ' / ' + h;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  Renderer.prototype.kick = function (amount) { this.shake = Math.max(this.shake, amount); };

  // --- セル1個 ---
  Renderer.prototype.drawCell = function (ctx, x, y, cell, opts) {
    opts = opts || {};
    var alpha = opts.alpha === undefined ? 1 : opts.alpha;
    ctx.save();
    ctx.globalAlpha = alpha;

    if (opts.ghost) {
      ctx.strokeStyle = cell.color;
      ctx.globalAlpha = alpha * 0.45;
      ctx.lineWidth = 2;
      roundRect(ctx, x + 2.5, y + 2.5, CELL - 5, CELL - 5, RADIUS);
      ctx.stroke();
      ctx.globalAlpha = alpha * 0.12;
      ctx.fillStyle = cell.color;
      ctx.fill();
      ctx.restore();
      return;
    }

    var grad = ctx.createLinearGradient(x, y, x, y + CELL);
    grad.addColorStop(0, cell.color);
    grad.addColorStop(1, cell.dark || cell.color);
    ctx.fillStyle = grad;
    roundRect(ctx, x + 1, y + 1, CELL - 2, CELL - 2, RADIUS);
    ctx.fill();

    // 上面のハイライト
    ctx.globalAlpha = alpha * 0.35;
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, x + 3, y + 3, CELL - 6, (CELL - 6) * 0.38, RADIUS - 2);
    ctx.fill();
    ctx.globalAlpha = alpha;

    if (this.showLetters && cell.letter) {
      var letter = cell.letter.toUpperCase();
      ctx.font = 'bold ' + Math.round(CELL * 0.56) + 'px "Trebuchet MS", "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(4, 10, 24, 0.85)';
      ctx.strokeText(letter, x + CELL / 2, y + CELL / 2 + 1);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(letter, x + CELL / 2, y + CELL / 2 + 1);
    }
    ctx.restore();
  };

  // --- 盤面 ---
  Renderer.prototype.draw = function (engine, dt) {
    var ctx = this.ctx;
    var cols = engine.cols;
    var hidden = engine.hidden;
    var visible = engine.rows - hidden;
    var w = cols * CELL;
    var h = visible * CELL;

    ctx.save();
    if (this.shake > 0) {
      var s = this.shake;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
      this.shake = Math.max(0, this.shake - dt * 0.04);
    }

    ctx.clearRect(-8, -8, w + 16, h + 16);
    var bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0b1120');
    bg.addColorStop(1, '#0f172a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // グリッド
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var c = 1; c < cols; c++) { ctx.moveTo(c * CELL + 0.5, 0); ctx.lineTo(c * CELL + 0.5, h); }
    for (var r = 1; r < visible; r++) { ctx.moveTo(0, r * CELL + 0.5); ctx.lineTo(w, r * CELL + 0.5); }
    ctx.stroke();

    // 消去中のマスを点滅させる
    var flashing = Object.create(null);
    if (engine.phase === 'clearing') {
      var t = 1 - Math.max(0, engine.clearTimer) / 240;
      engine.clearingCells.forEach(function (rc) { flashing[rc[0] + ':' + rc[1]] = t; });
    }

    // 固定ブロック
    for (var br = hidden; br < engine.rows; br++) {
      for (var bc = 0; bc < cols; bc++) {
        var cell = engine.board[br][bc];
        if (!cell) continue;
        var px = bc * CELL;
        var py = (br - hidden) * CELL;
        var f = flashing[br + ':' + bc];
        if (f !== undefined) {
          this.drawCell(ctx, px, py, cell, { alpha: 1 - f * 0.15 });
          ctx.save();
          ctx.globalAlpha = 0.35 + 0.5 * Math.abs(Math.sin(f * Math.PI * 3));
          ctx.fillStyle = '#ffffff';
          roundRect(ctx, px + 1, py + 1, CELL - 2, CELL - 2, RADIUS);
          ctx.fill();
          ctx.restore();
        } else {
          this.drawCell(ctx, px, py, cell);
        }
      }
    }

    // ゴースト + 落下中のミノ
    if (engine.active && engine.phase === 'falling') {
      var def = global.Tetromino.PIECES[engine.active.type];
      var piece = engine.active;
      if (this.showGhost) {
        var gy = engine.ghostY();
        engine.cellsOf(piece, piece.rot, piece.x, gy).forEach(function (cell) {
          if (cell.r < hidden) return;
          this.drawCell(ctx, cell.c * CELL, (cell.r - hidden) * CELL,
            { color: def.color, dark: def.dark, letter: null }, { ghost: true });
        }, this);
      }
      engine.cellsOf(piece).forEach(function (cell) {
        if (cell.r < hidden) return;
        this.drawCell(ctx, cell.c * CELL, (cell.r - hidden) * CELL,
          { color: def.color, dark: def.dark, letter: cell.letter });
      }, this);
    }

    ctx.restore();
  };

  // --- HOLD / NEXT ---
  Renderer.prototype.drawPieceBox = function (ctx, spec, x, y, scale, dim) {
    if (!spec) return;
    var def = global.Tetromino.PIECES[spec.type];
    var cells = def.states[0];
    var minX = Math.min.apply(null, cells.map(function (p) { return p[0]; }));
    var maxX = Math.max.apply(null, cells.map(function (p) { return p[0]; }));
    var minY = Math.min.apply(null, cells.map(function (p) { return p[1]; }));
    var maxY = Math.max.apply(null, cells.map(function (p) { return p[1]; }));
    var wCells = maxX - minX + 1;
    var hCells = maxY - minY + 1;
    var size = CELL * scale;
    var ox = x - (wCells * size) / 2 - minX * size;
    var oy = y - (hCells * size) / 2 - minY * size;

    ctx.save();
    ctx.globalAlpha = dim ? 0.35 : 1;
    ctx.scale(scale, scale);
    for (var i = 0; i < cells.length; i++) {
      this.drawCell(ctx, (ox + cells[i][0] * size) / scale, (oy + cells[i][1] * size) / scale,
        { color: def.color, dark: def.dark, letter: spec.letters ? spec.letters[i] : null });
    }
    ctx.restore();
  };

  Renderer.prototype.drawHold = function (engine) {
    var ctx = this.holdCtx;
    ctx.clearRect(0, 0, 4 * CELL, 3 * CELL);
    this.drawPieceBox(ctx, engine.hold, 2 * CELL, 1.5 * CELL, 0.8, engine.holdUsed);
  };

  Renderer.prototype.drawNext = function (engine) {
    var ctx = this.nextCtx;
    var h = (engine.nextCount * 2.2 + 0.4) * CELL;
    ctx.clearRect(0, 0, 3.4 * CELL, h);
    for (var i = 0; i < engine.queue.length && i < engine.nextCount; i++) {
      var cy = (1.1 + i * 2.2) * CELL;
      this.drawPieceBox(ctx, engine.queue[i], 1.7 * CELL, cy, i === 0 ? 0.8 : 0.68, false);
    }
  };

  Renderer.CELL = CELL;
  global.Renderer = Renderer;
})(window);
