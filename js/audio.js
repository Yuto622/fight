/* 効果音 / Tiny WebAudio synth (no external assets). */
(function (global) {
  'use strict';

  function Sfx() {
    this.ctx = null;
    this.enabled = true;
  }

  Sfx.prototype.ensure = function () {
    if (!this.ctx) {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  };

  Sfx.prototype.tone = function (freq, dur, type, gain, delay) {
    if (!this.enabled) return;
    var ctx = this.ensure();
    if (!ctx) return;
    var t0 = ctx.currentTime + (delay || 0);
    var osc = ctx.createOscillator();
    var amp = ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain || 0.06, t0 + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(amp).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  };

  Sfx.prototype.move = function () { this.tone(220, 0.05, 'square', 0.025); };
  Sfx.prototype.rotate = function () { this.tone(330, 0.06, 'triangle', 0.04); };
  Sfx.prototype.lock = function () { this.tone(150, 0.09, 'square', 0.045); };
  Sfx.prototype.drop = function () { this.tone(90, 0.12, 'sawtooth', 0.05); };
  Sfx.prototype.hold = function () { this.tone(440, 0.08, 'triangle', 0.04); };
  Sfx.prototype.lines = function (n) {
    var base = [0, 523, 587, 659, 784][n] || 523;
    for (var i = 0; i < n; i++) this.tone(base * (1 + i * 0.18), 0.14, 'triangle', 0.05, i * 0.05);
  };
  Sfx.prototype.word = function (len, chain) {
    var base = 440 * Math.pow(1.06, (len - 3) * 2 + (chain - 1) * 3);
    for (var i = 0; i < Math.min(len, 6); i++) {
      this.tone(base * Math.pow(1.26, i), 0.16, 'triangle', 0.055, i * 0.055);
    }
  };
  Sfx.prototype.coin = function () {
    this.tone(988, 0.07, 'square', 0.05);
    this.tone(1319, 0.14, 'square', 0.05, 0.06);
  };
  Sfx.prototype.level = function () {
    [523, 659, 784, 1047].forEach(function (f, i) { this.tone(f, 0.16, 'triangle', 0.05, i * 0.07); }, this);
  };
  Sfx.prototype.over = function () {
    [440, 392, 330, 262].forEach(function (f, i) { this.tone(f, 0.3, 'sawtooth', 0.05, i * 0.14); }, this);
  };

  global.Sfx = new Sfx();
})(window);
