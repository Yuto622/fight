/* 入力 / Keyboard + touch input with DAS / ARR handling.
 * DAS = 横移動が連射に入るまでの溜め時間、ARR = 連射間隔。 */
(function (global) {
  'use strict';

  function Input(opts) {
    this.das = opts.das || 150;
    this.arr = opts.arr || 33;
    this.actions = opts.actions;
    this.enabled = true;

    this.dir = 0;           // -1 / 0 / 1
    this.dirTimer = 0;
    this.repeating = false;
    this.held = Object.create(null);
    this.softDrop = false;

    this._bind();
  }

  var KEYMAP = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'softDrop', ArrowUp: 'rotateCW',
    KeyA: 'left', KeyD: 'right', KeyS: 'softDrop', KeyW: 'rotateCW',
    Space: 'hardDrop', KeyZ: 'rotateCCW', KeyX: 'rotateCW', KeyQ: 'rotate180',
    ShiftLeft: 'hold', ShiftRight: 'hold', KeyC: 'hold',
    KeyR: 'reroll', KeyP: 'pause', Escape: 'pause', Enter: 'confirm', KeyM: 'mute'
  };

  Input.prototype._bind = function () {
    var self = this;
    global.addEventListener('keydown', function (e) {
      var action = KEYMAP[e.code];
      if (!action) return;
      if (e.code === 'Space' || e.code.indexOf('Arrow') === 0) e.preventDefault();
      if (e.repeat) return;
      self.press(action);
    });
    global.addEventListener('keyup', function (e) {
      var action = KEYMAP[e.code];
      if (!action) return;
      self.release(action);
    });
    global.addEventListener('blur', function () {
      self.dir = 0; self.softDrop = false; self.held = Object.create(null);
      if (self.actions.softDropChange) self.actions.softDropChange(false);
    });
  };

  Input.prototype.press = function (action) {
    this.held[action] = true;
    var a = this.actions;
    switch (action) {
      case 'left':
      case 'right':
        if (!this.enabled) return;
        this.dir = action === 'left' ? -1 : 1;
        this.dirTimer = 0;
        this.repeating = false;
        a.move(this.dir);
        break;
      case 'softDrop':
        if (!this.enabled) return;
        this.softDrop = true;
        a.softDropChange(true);
        break;
      case 'hardDrop': if (this.enabled) a.hardDrop(); break;
      case 'rotateCW': if (this.enabled) a.rotate(1); break;
      case 'rotateCCW': if (this.enabled) a.rotate(-1); break;
      case 'rotate180': if (this.enabled) a.rotate(2); break;
      case 'hold': if (this.enabled) a.hold(); break;
      case 'reroll': if (this.enabled) a.reroll(); break;
      case 'pause': a.pause(); break;
      case 'confirm': a.confirm(); break;
      case 'mute': a.mute(); break;
    }
  };

  Input.prototype.release = function (action) {
    this.held[action] = false;
    if (action === 'left' || action === 'right') {
      var releasedDir = action === 'left' ? -1 : 1;
      if (this.dir === releasedDir) {
        // 反対側が押しっぱなしなら、そちらに切り替える
        if (this.held.left) { this.dir = -1; this.dirTimer = 0; this.repeating = false; }
        else if (this.held.right) { this.dir = 1; this.dirTimer = 0; this.repeating = false; }
        else this.dir = 0;
      }
    }
    if (action === 'softDrop') {
      this.softDrop = false;
      this.actions.softDropChange(false);
    }
  };

  Input.prototype.update = function (dt) {
    if (!this.enabled || !this.dir) return;
    this.dirTimer += dt;
    if (!this.repeating) {
      if (this.dirTimer >= this.das) { this.repeating = true; this.dirTimer -= this.das; this.actions.move(this.dir); }
      return;
    }
    if (this.arr <= 0) {
      // ARR 0 = 端まで一気に寄せる
      for (var i = 0; i < 10; i++) if (!this.actions.move(this.dir)) break;
      return;
    }
    while (this.dirTimer >= this.arr) {
      this.dirTimer -= this.arr;
      this.actions.move(this.dir);
    }
  };

  /* 画面上のボタン（スマホ用） */
  Input.prototype.bindTouch = function (root) {
    var self = this;
    Array.prototype.forEach.call(root.querySelectorAll('[data-action]'), function (btn) {
      var action = btn.getAttribute('data-action');
      var start = function (e) { e.preventDefault(); self.press(action); btn.classList.add('is-down'); };
      var end = function (e) { e.preventDefault(); self.release(action); btn.classList.remove('is-down'); };
      btn.addEventListener('touchstart', start, { passive: false });
      btn.addEventListener('touchend', end);
      btn.addEventListener('touchcancel', end);
      btn.addEventListener('mousedown', start);
      btn.addEventListener('mouseup', end);
      btn.addEventListener('mouseleave', function () {
        if (self.held[action]) { self.release(action); btn.classList.remove('is-down'); }
      });
    });
  };

  global.Input = Input;
})(window);
