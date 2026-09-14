'use strict';
/* =====================================================================
   BRAWL ARENA - 大乱闘バトルアリーナ
   HTML5 Canvas 製プラットフォーム格闘ゲーム（オリジナルキャラクター）
   ダメージ％ / 吹っ飛ばし / 場外KO / ストック制 / CPU対戦 / ゲームパッド
   ===================================================================== */

const W = 1280, H = 720;
const KB_SCALE = 0.085;       // 吹っ飛ばし値 → 速度(px/frame)
const HITSTUN_SCALE = 0.4;    // 吹っ飛ばし値 → ヒットストップ後の硬直フレーム
const PLAYER_COLORS = ['#ff4b4b', '#4b8bff', '#f5d142', '#4bdc6a'];
const PLAYER_NAMES = ['P1', 'P2', 'P3', 'P4'];

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

/* ---------------------------------------------------------------------
   ユーティリティ
--------------------------------------------------------------------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const DEG = Math.PI / 180;
const easeOut = t => 1 - Math.pow(1 - t, 3);

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function circleRect(cx, cy, r, rx, ry, rw, rh) {
  const nx = clamp(cx, rx, rx + rw), ny = clamp(cy, ry, ry + rh);
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}

/* ---------------------------------------------------------------------
   サウンド（WebAudio で合成）
--------------------------------------------------------------------- */
const Sound = {
  ctx: null, enabled: true, master: null,
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    } catch (e) { this.enabled = false; }
  },
  tone(freq, dur, type = 'square', vol = 0.2, slideTo = null) {
    if (!this.ctx || !this.enabled) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol = 0.25, lp = 2000) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t);
  },
  play(name, p = 1) {
    switch (name) {
      case 'hit': this.noise(0.08, 0.3, 1200); this.tone(180, 0.1, 'square', 0.15, 80); break;
      case 'hitHeavy': this.noise(0.18, 0.5, 900); this.tone(120, 0.25, 'sawtooth', 0.25, 40); break;
      case 'jump': this.tone(300, 0.12, 'sine', 0.12, 600); break;
      case 'djump': this.tone(400, 0.15, 'triangle', 0.12, 900); break;
      case 'shield': this.tone(900, 0.08, 'sine', 0.1, 500); break;
      case 'shieldHit': this.tone(700, 0.1, 'square', 0.12, 400); this.noise(0.05, 0.15, 3000); break;
      case 'shieldBreak': this.noise(0.4, 0.4, 2500); this.tone(1200, 0.4, 'sawtooth', 0.2, 100); break;
      case 'ko': this.noise(0.6, 0.6, 600); this.tone(80, 0.6, 'sawtooth', 0.3, 30); this.tone(1500, 0.5, 'sine', 0.1, 200); break;
      case 'swing': this.noise(0.06, 0.08, 4000); break;
      case 'select': this.tone(880, 0.08, 'square', 0.12); this.tone(1320, 0.12, 'square', 0.1); break;
      case 'move': this.tone(660, 0.05, 'square', 0.08); break;
      case 'back': this.tone(440, 0.1, 'square', 0.1, 220); break;
      case 'charge': this.tone(200 + p * 500, 0.05, 'sine', 0.06); break;
      case 'shot': this.tone(500, 0.1, 'square', 0.1, 200); break;
      case 'special': this.tone(300, 0.2, 'sawtooth', 0.12, 900); break;
      case 'dodge': this.noise(0.1, 0.1, 5000); break;
      case 'count': this.tone(600, 0.15, 'square', 0.15); break;
      case 'go': this.tone(800, 0.3, 'square', 0.18); this.tone(1200, 0.4, 'square', 0.15); break;
      case 'game': this.tone(500, 0.5, 'sawtooth', 0.2, 250); this.noise(0.5, 0.3, 800); break;
      case 'land': this.noise(0.05, 0.12, 800); break;
      case 'counter': this.tone(1000, 0.2, 'sine', 0.15, 2000); break;
    }
  }
};

/* ---------------------------------------------------------------------
   入力（キーボード + ゲームパッド）
--------------------------------------------------------------------- */
const keys = {};
const tapped = {};   // 1フレーム未満の短いタップも取りこぼさない
let prevKeys = {};
const INPUT_KEYS = ['left', 'right', 'up', 'down', 'jump', 'attack', 'special', 'shield'];
const KEYMAPS = [
  { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'], jump: ['KeyW', 'Space'], attack: ['KeyJ'], special: ['KeyK'], shield: ['KeyL', 'ShiftLeft'] },
  { left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'], jump: ['ArrowUp', 'Numpad0'], attack: ['Comma', 'Numpad1'], special: ['Period', 'Numpad2'], shield: ['Slash', 'Numpad3', 'ShiftRight'] },
];
const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Slash']);
window.addEventListener('keydown', e => {
  if (PREVENT.has(e.code)) e.preventDefault();
  keys[e.code] = true; tapped[e.code] = true;
  Sound.init();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
canvas.addEventListener('pointerdown', () => Sound.init());

const keyDown = list => list.some(k => keys[k] || tapped[k]);
const keyPressed = code => !!(keys[code] || tapped[code]) && !prevKeys[code];

function readGamepad(i) {
  const gps = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = gps && gps[i];
  if (!gp) return null;
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
  const b = n => !!(gp.buttons[n] && gp.buttons[n].pressed);
  return {
    left: ax < -0.4 || b(14), right: ax > 0.4 || b(15),
    up: ay < -0.5 || b(12), down: ay > 0.5 || b(13),
    jump: b(0) || b(3) || ay < -0.6, attack: b(2), special: b(1),
    shield: b(4) || b(5) || b(6) || b(7),
  };
}

function emptyInput() {
  const o = {};
  for (const k of INPUT_KEYS) { o[k] = false; o[k + 'P'] = false; o[k + 'R'] = false; }
  return o;
}
function finishInput(cur, prev) {
  for (const k of INPUT_KEYS) {
    cur[k + 'P'] = !!cur[k] && !prev[k];
    cur[k + 'R'] = !cur[k] && !!prev[k];
  }
  return cur;
}
const prevInputs = [{}, {}, {}, {}];
function getPlayerInput(i) {
  const m = KEYMAPS[i];
  const pad = readGamepad(i);
  const cur = {};
  for (const k of INPUT_KEYS) cur[k] = (m ? keyDown(m[k]) : false) || (pad ? pad[k] : false);
  finishInput(cur, prevInputs[i]);
  prevInputs[i] = cur;
  return cur;
}

/* ---------------------------------------------------------------------
   技データ
   hits: {s,e: 攻撃判定フレーム, x,y: 中心からのオフセット(前方が+x), r: 半径,
          dmg, ang: 吹っ飛ばし角度(0=前方水平,90=真上), bkb: 基礎, kbg: 成長}
--------------------------------------------------------------------- */
function makeStandardMoves(c) {
  const P = c.pow, R = c.reach, S = c.spd;
  const fr = x => Math.max(1, Math.round(x * S));
  const H = (s, e, x, y, r, dmg, ang, bkb, kbg) => ({ s: fr(s), e: fr(e), x: x * R, y, r: r * R, dmg: dmg * P, ang, bkb, kbg });
  return {
    jab:    { dur: fr(16), anim: 'punch', hits: [H(4, 7, 36, -8, 22, 3, 361, 15, 25)], next: 'jab2', nextFrom: fr(7) },
    jab2:   { dur: fr(20), anim: 'kick',  hits: [H(5, 9, 42, 0, 24, 5, 50, 40, 60)] },
    ftilt:  { dur: fr(24), anim: 'kick',  hits: [H(7, 11, 48, -4, 26, 9, 35, 30, 78)] },
    utilt:  { dur: fr(26), anim: 'upper', hits: [H(6, 12, 8, -52, 32, 8, 90, 38, 92)] },
    dtilt:  { dur: fr(22), anim: 'sweep', hits: [H(6, 10, 42, 30, 24, 7, 78, 28, 72)] },
    fsmash: { dur: fr(42), anim: 'punch', smash: true, hits: [H(14, 18, 52, -6, 32, 16, 40, 34, 96)] },
    usmash: { dur: fr(44), anim: 'upper', smash: true, hits: [H(12, 18, 4, -62, 40, 15, 88, 36, 100)] },
    dsmash: { dur: fr(46), anim: 'sweep', smash: true, hits: [H(12, 16, 46, 26, 28, 13, 30, 40, 92), H(19, 23, -46, 26, 28, 13, 30, 40, 92)] },
    dash:   { dur: fr(32), anim: 'dashatk', hits: [H(6, 14, 34, 0, 30, 10, 62, 50, 66)], motion: [{ s: 0, e: fr(12), vx: 8 }] },
    nair:   { dur: fr(32), anim: 'spin', aerial: true, hits: [H(4, 20, 0, 0, 40, 9, 45, 22, 82)] },
    fair:   { dur: fr(34), anim: 'kick', aerial: true, hits: [H(8, 14, 46, 0, 28, 12, 40, 30, 92)] },
    bair:   { dur: fr(30), anim: 'backkick', aerial: true, hits: [H(6, 12, -46, -4, 28, 13, 35, 36, 94)] },
    uair:   { dur: fr(28), anim: 'upper', aerial: true, hits: [H(6, 12, 4, -52, 32, 10, 85, 26, 92)] },
    dair:   { dur: fr(36), anim: 'stomp', aerial: true, hits: [H(11, 17, 0, 50, 30, 14, 270, 30, 88)] },
    counterhit: { dur: fr(30), anim: 'punch', hits: [H(4, 12, 40, -6, 40, 10, 45, 50, 90)] },
  };
}

const CHARACTERS = [
  {
    id: 'ember', name: 'エンバー', en: 'EMBER', desc: '炎をまとう格闘家。スピードとパワーのバランス型。',
    colors: { body: '#e0452e', dark: '#8f2416', skin: '#ffd9b0', accent: '#ffb52e', hair: '#ff6a00' }, flair: 'flame',
    w: 44, h: 78, weight: 100, speed: 6.6, airSpeed: 4.6, airAccel: 0.42, jump: 13.6, djump: 12.6,
    gravity: 0.52, fall: 10.5, ffall: 16, jumps: 1, pow: 1, reach: 1, spd: 1, shieldMax: 60,
    specials: {
      nspec: { dur: 34, anim: 'punch', aerial: true, hits: [], spawn: { frame: 12, fn: (f, g) => {
        Sound.play('shot');
        g.spawnProjectile({ owner: f, x: f.x + f.facing * 30, y: f.y - 8, vx: f.facing * 9, vy: 0, r: 13, dmg: 6, ang: 45, bkb: 22, kbg: 50, life: 70, color: '#ff8a1e', glow: '#ffd23e', type: 'fire' });
      } } },
      sspec: { dur: 38, anim: 'dashatk', aerial: true, hits: [{ s: 6, e: 20, x: 26, y: 0, r: 32, dmg: 11, ang: 42, bkb: 42, kbg: 82 }],
        motion: [{ s: 6, e: 20, vx: 12, vy: 0 }], trail: '#ff6a00' },
      uspec: { dur: 42, anim: 'rise', aerial: true, helpless: true, hits: [{ s: 3, e: 24, x: 0, y: -10, r: 42, dmg: 10, ang: 80, bkb: 62, kbg: 72 }],
        motion: [{ s: 0, e: 14, vy: -13 }, { s: 15, e: 24, vy: -5 }], trail: '#ff6a00',
        onStart: (f) => { Sound.play('special'); f.jumps = 0; } },
      dspec: { dur: 48, anim: 'slam', aerial: true, hits: [{ s: 18, e: 24, x: 0, y: 0, r: 74, dmg: 14, ang: 70, bkb: 52, kbg: 92 }],
        onFrame: (f, g, fr) => { if (fr === 18) { g.addEffect('ring', f.x, f.y, { color: '#ff8a1e', size: 80 }); g.shake(6); Sound.play('special'); } } },
    },
  },
  {
    id: 'glacia', name: 'グラシア', en: 'GLACIA', desc: '氷の魔導士。ふわふわした機動と遠距離攻撃が得意。',
    colors: { body: '#3f8fe0', dark: '#1f4f8f', skin: '#f2f0ff', accent: '#bfefff', hair: '#e8fbff' }, flair: 'ice',
    w: 44, h: 80, weight: 85, speed: 5.3, airSpeed: 4.9, airAccel: 0.4, jump: 12.6, djump: 12.8,
    gravity: 0.4, fall: 8.2, ffall: 13, jumps: 1, pow: 0.92, reach: 1.1, spd: 1, shieldMax: 60,
    specials: {
      nspec: { dur: 36, anim: 'punch', aerial: true, hits: [], spawn: { frame: 14, fn: (f, g) => {
        Sound.play('shot');
        g.spawnProjectile({ owner: f, x: f.x + f.facing * 30, y: f.y - 10, vx: f.facing * 7, vy: 0, r: 12, dmg: 5, ang: 60, bkb: 34, kbg: 40, life: 90, color: '#bfefff', glow: '#ffffff', type: 'ice', extraStun: 10 });
      } } },
      sspec: { dur: 40, anim: 'slide', aerial: true, hits: [{ s: 4, e: 24, x: 20, y: 10, r: 30, dmg: 9, ang: 30, bkb: 38, kbg: 80 }],
        motion: [{ s: 4, e: 24, vx: 9.5 }], trail: '#bfefff' },
      uspec: { dur: 30, anim: 'rise', aerial: true, helpless: true, hits: [{ s: 14, e: 18, x: 0, y: 0, r: 36, dmg: 6, ang: 75, bkb: 40, kbg: 60 }],
        onStart: (f, g, inp) => {
          Sound.play('special'); f.jumps = 0;
          let dx = 0, dy = -1;
          if (inp && (inp.left || inp.right)) dx = inp.left ? -1 : 1;
          if (inp && inp.down) dy = 1; else if (inp && !inp.up && dx !== 0) dy = -0.5;
          const l = Math.hypot(dx, dy) || 1;
          f.tele = { dx: dx / l, dy: dy / l };
        },
        onFrame: (f, g, fr) => {
          if (fr >= 5 && fr <= 13) { f.invisible = true; f.vx = 0; f.vy = 0; f.noGravity = true; }
          else f.invisible = false;
          if (fr === 5) g.addEffect('ring', f.x, f.y, { color: '#bfefff', size: 50 });
          if (fr === 13) { f.x += f.tele.dx * 180; f.y += f.tele.dy * 180; g.addEffect('ring', f.x, f.y, { color: '#ffffff', size: 60 }); }
        } },
      dspec: { dur: 46, anim: 'guard', aerial: true, hits: [],
        onStart: (f) => { f.counter = 22; Sound.play('shield'); },
        onFrame: (f, g, fr) => { if (fr === 3) g.addEffect('ring', f.x, f.y, { color: '#bfefff', size: 40 }); } },
    },
  },
  {
    id: 'volt', name: 'ボルト', en: 'VOLT', desc: '雷速のスピードスター。軽いが手数で圧倒する。',
    colors: { body: '#f2c21b', dark: '#9a7a00', skin: '#ffe6c2', accent: '#ffffff', hair: '#fff27a' }, flair: 'bolt',
    w: 38, h: 70, weight: 78, speed: 8.6, airSpeed: 5.6, airAccel: 0.5, jump: 14.2, djump: 13.2,
    gravity: 0.56, fall: 12, ffall: 18, jumps: 1, pow: 0.82, reach: 0.88, spd: 0.85, shieldMax: 52,
    specials: {
      nspec: { dur: 24, anim: 'punch', aerial: true, hits: [], spawn: { frame: 8, fn: (f, g) => {
        Sound.play('shot');
        g.spawnProjectile({ owner: f, x: f.x + f.facing * 26, y: f.y - 8, vx: f.facing * 15, vy: 0, r: 8, dmg: 4, ang: 30, bkb: 16, kbg: 40, life: 45, color: '#fff27a', glow: '#ffffff', type: 'spark' });
      } } },
      sspec: { dur: 30, anim: 'dashatk', aerial: true, hits: [{ s: 3, e: 15, x: 24, y: 0, r: 28, dmg: 8, ang: 50, bkb: 32, kbg: 76 }],
        motion: [{ s: 3, e: 15, vx: 14, vy: 0 }], trail: '#fff27a' },
      uspec: { dur: 30, anim: 'rise', aerial: true, helpless: true, hits: [{ s: 3, e: 14, x: 0, y: 0, r: 34, dmg: 7, ang: 70, bkb: 42, kbg: 70 }],
        onStart: (f, g, inp) => {
          Sound.play('special'); f.jumps = 0;
          let dx = 0, dy = -1;
          if (inp && (inp.left || inp.right)) { dx = inp.left ? -1 : 1; dy = inp.down ? 0.6 : (inp.up ? -1 : -0.7); }
          const l = Math.hypot(dx, dy) || 1;
          f.zip = { dx: dx / l, dy: dy / l };
        },
        onFrame: (f, g, fr) => {
          if (fr >= 3 && fr <= 12) { f.vx = f.zip.dx * 19; f.vy = f.zip.dy * 19; f.noGravity = true; g.addParticle(f.x, f.y, '#fff27a'); }
          if (fr === 13) { f.vx *= 0.3; f.vy *= 0.3; }
        }, trail: '#fff27a' },
      dspec: { dur: 44, anim: 'stomp', aerial: true, hits: [{ s: 14, e: 44, x: 0, y: 30, r: 34, dmg: 12, ang: 270, bkb: 34, kbg: 84 }],
        onStart: (f) => { Sound.play('special'); },
        onFrame: (f, g, fr) => {
          if (f.onGround) {
            if (fr < 14) { f.vx = 0; }
            if (fr === 14) { g.addEffect('ring', f.x, f.y + 30, { color: '#fff27a', size: 60 }); }
          } else {
            if (fr < 10) { f.vx = 0; f.vy = 0; f.noGravity = true; }
            else if (fr >= 10) { f.vy = 20; f.vx = 0; g.addParticle(f.x, f.y - 20, '#fff27a'); }
          }
        },
        onLand: (f, g) => { g.addEffect('ring', f.x, f.y + 30, { color: '#fff27a', size: 60 }); g.shake(5); } },
    },
  },
  {
    id: 'gorm', name: 'ゴルム', en: 'GORM', desc: '岩の巨人。動きは遅いが一撃は超重量級。',
    colors: { body: '#5d8f3a', dark: '#2f4d1c', skin: '#c8d6a3', accent: '#8f6a3a', hair: '#3d2b1a' }, flair: 'rock',
    w: 60, h: 90, weight: 132, speed: 4.9, airSpeed: 3.7, airAccel: 0.3, jump: 12.4, djump: 11.4,
    gravity: 0.56, fall: 11, ffall: 17, jumps: 1, pow: 1.36, reach: 1.16, spd: 1.15, shieldMax: 70,
    specials: {
      nspec: { dur: 44, anim: 'upper', aerial: true, hits: [], spawn: { frame: 18, fn: (f, g) => {
        Sound.play('shot');
        g.spawnProjectile({ owner: f, x: f.x + f.facing * 26, y: f.y - 40, vx: f.facing * 6.5, vy: -7, gravity: 0.36, r: 19, dmg: 12, ang: 50, bkb: 42, kbg: 70, life: 140, color: '#8f6a3a', glow: '#c8b08a', type: 'rock' });
      } } },
      sspec: { dur: 50, anim: 'dashatk', aerial: true, hits: [{ s: 10, e: 32, x: 30, y: 0, r: 38, dmg: 14, ang: 40, bkb: 52, kbg: 82 }],
        motion: [{ s: 10, e: 32, vx: 9, vy: 0 }], armor: { s: 6, e: 34, val: 90 }, trail: '#8f6a3a' },
      uspec: { dur: 44, anim: 'rise', aerial: true, helpless: true, hits: [{ s: 2, e: 16, x: 0, y: -10, r: 46, dmg: 11, ang: 85, bkb: 56, kbg: 74 }],
        motion: [{ s: 0, e: 0, vy: -17.5 }], trail: '#8f6a3a',
        onStart: (f, g) => { Sound.play('special'); f.jumps = 0; g.addEffect('ring', f.x, f.y + 30, { color: '#c8b08a', size: 50 }); } },
      dspec: { dur: 54, anim: 'slam', aerial: true, hits: [{ s: 22, e: 30, x: 0, y: 34, r: 96, dmg: 18, ang: 80, bkb: 62, kbg: 86 }],
        onStart: (f) => { Sound.play('special'); },
        onFrame: (f, g, fr) => {
          if (!f.onGround) { f.vy = 18; f.vx = 0; f.moveFrame = Math.min(f.moveFrame, 20); }
          if (f.onGround && fr === 22) { g.addEffect('ring', f.x, f.y + 40, { color: '#c8b08a', size: 110 }); g.shake(14); Sound.play('hitHeavy'); }
        } },
    },
  },
];
for (const c of CHARACTERS) c.moves = Object.assign(makeStandardMoves(c), c.specials);

/* ---------------------------------------------------------------------
   ステージ
--------------------------------------------------------------------- */
const STAGES = [
  {
    id: 'island', name: 'フローティング・アイランド', desc: '3つの浮遊台がある定番ステージ',
    theme: 'sky',
    platforms: [
      { x: 290, y: 500, w: 700, h: 70, soft: false, main: true },
      { x: 390, y: 385, w: 180, h: 14, soft: true },
      { x: 710, y: 385, w: 180, h: 14, soft: true },
      { x: 550, y: 270, w: 180, h: 14, soft: true },
    ],
    blast: { l: -230, r: W + 230, t: -270, b: H + 150 },
    spawns: [{ x: 460, y: 460 }, { x: 820, y: 460 }, { x: 380, y: 460 }, { x: 900, y: 460 }],
    respawn: { x: 640, y: 150 },
  },
  {
    id: 'void', name: 'ボイドアリーナ', desc: '足場なしの真剣勝負。宇宙に浮かぶ平坦な闘技場',
    theme: 'space',
    platforms: [
      { x: 240, y: 520, w: 800, h: 80, soft: false, main: true },
    ],
    blast: { l: -240, r: W + 240, t: -280, b: H + 140 },
    spawns: [{ x: 480, y: 480 }, { x: 800, y: 480 }, { x: 380, y: 480 }, { x: 900, y: 480 }],
    respawn: { x: 640, y: 150 },
  },
  {
    id: 'tower', name: 'スカイタワー', desc: '動く足場に注意。狭い塔の頂上',
    theme: 'city',
    platforms: [
      { x: 400, y: 520, w: 480, h: 120, soft: false, main: true },
      { x: 560, y: 360, w: 160, h: 14, soft: true, move: { x0: 240, x1: 880, period: 420 } },
      { x: 580, y: 240, w: 120, h: 14, soft: true },
    ],
    blast: { l: -220, r: W + 220, t: -280, b: H + 160 },
    spawns: [{ x: 500, y: 480 }, { x: 780, y: 480 }, { x: 440, y: 480 }, { x: 840, y: 480 }],
    respawn: { x: 640, y: 130 },
  },
];
for (const s of STAGES) {
  const m = s.platforms.find(p => p.main);
  s.main = m;
  s.ledges = [{ x: m.x, y: m.y, dir: 1 }, { x: m.x + m.w, y: m.y, dir: -1 }];
}

/* ---------------------------------------------------------------------
   ファイター
--------------------------------------------------------------------- */
const GROUND_STATES = new Set(['idle', 'run', 'land', 'shield', 'spotdodge', 'roll', 'charge', 'knockdown', 'shieldbreak', 'crouch']);

class Fighter {
  constructor(def, index, opts) {
    this.def = def; this.index = index; this.id = index;
    this.cpu = !!opts.cpu; this.level = opts.level || 5;
    this.color = PLAYER_COLORS[index];
    this.w = def.w; this.h = def.h;
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; this.facing = 1;
    this.percent = 0; this.stocks = opts.stocks || 3;
    this.kos = 0; this.falls = 0; this.damageDealt = 0;
    this.state = 'idle'; this.st = 0;
    this.onGround = false; this.platform = null;
    this.jumps = def.jumps; this.jumpTimer = 0;
    this.move = null; this.moveKey = null; this.moveFrame = 0; this.hitIds = new Set(); this.dmgMult = 1;
    this.hitlag = 0; this.hitstun = 0; this.tumble = false;
    this.invincible = 0; this.shieldHP = def.shieldMax; this.shieldStun = 0;
    this.ledgeCooldown = 0; this.ledge = null; this.dropTimer = 0;
    this.charge = 0; this.chargeMove = null;
    this.dirTap = { left: 0, right: 0, up: 0, down: 0 };
    this.fastFalling = false; this.airdodged = false;
    this.dead = false; this.respawnTimer = 0; this.lastHitBy = null; this.lastHitTimer = 0;
    this.counter = 0; this.invisible = false; this.noGravity = false;
    this.landLag = 0; this.rollDir = 1; this.lastKB = 0;
    this.ai = { cool: 30, wander: 0, shieldT: 0, jumpT: 0 };
    this.anim = 0;
  }

  get rect() { return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h }; }
  get alive() { return !this.dead && this.stocks > 0; }

  isInvulnerable() {
    if (this.invincible > 0 || this.dead || this.state === 'respawn') return true;
    if (this.state === 'spotdodge' && this.st >= 3 && this.st <= 18) return true;
    if (this.state === 'roll' && this.st >= 4 && this.st <= 17) return true;
    if (this.state === 'airdodge' && this.st >= 2 && this.st <= 18) return true;
    if (this.invisible) return true;
    return false;
  }
  getArmor() {
    const m = this.move;
    if (this.state === 'attack' && m && m.armor && this.moveFrame >= m.armor.s && this.moveFrame <= m.armor.e) return m.armor.val;
    return 0;
  }
  canAct() { return this.state === 'idle' || this.state === 'run' || this.state === 'air' || this.state === 'crouch'; }

  spawnAt(p) {
    this.x = p.x; this.y = p.y - this.h / 2; this.vx = 0; this.vy = 0;
    this.state = 'idle'; this.st = 0; this.onGround = true;
  }

  respawn(g) {
    this.dead = false;
    this.x = g.stage.respawn.x; this.y = g.stage.respawn.y;
    this.vx = 0; this.vy = 0; this.percent = 0;
    this.state = 'respawn'; this.st = 0; this.invincible = 170;
    this.jumps = this.def.jumps; this.shieldHP = this.def.shieldMax;
    this.move = null; this.hitstun = 0; this.tumble = false; this.onGround = false;
    this.facing = this.x < W / 2 ? 1 : -1;
  }

  /* --------- メイン更新 --------- */
  update(input, g) {
    const d = this.def;
    if (this.dead) {
      if (this.stocks > 0) { this.respawnTimer--; if (this.respawnTimer <= 0) this.respawn(g); }
      return;
    }
    if (this.hitlag > 0) { this.hitlag--; return; }
    if (this.invincible > 0) this.invincible--;
    if (this.ledgeCooldown > 0) this.ledgeCooldown--;
    if (this.dropTimer > 0) this.dropTimer--;
    if (this.counter > 0) this.counter--;
    if (this.lastHitTimer > 0) { this.lastHitTimer--; if (this.lastHitTimer === 0) this.lastHitBy = null; }
    for (const k in this.dirTap) if (this.dirTap[k] > 0) this.dirTap[k]--;
    if (input.leftP) this.dirTap.left = 9;
    if (input.rightP) this.dirTap.right = 9;
    if (input.upP) this.dirTap.up = 9;
    if (input.downP) this.dirTap.down = 9;
    if (input.smash) { this.dirTap.left = this.dirTap.right = this.dirTap.up = this.dirTap.down = 9; }
    if (this.state !== 'shield' && this.state !== 'shieldbreak' && this.shieldHP < d.shieldMax) this.shieldHP = Math.min(d.shieldMax, this.shieldHP + 0.09);
    this.st++;
    this.anim++;
    this.noGravity = false;

    const prevGround = this.onGround;
    this.handleState(input, g);
    this.physics(g);
    this.checkLedge(input, g);
    if (prevGround && !this.onGround && GROUND_STATES.has(this.state)) { this.state = 'air'; this.st = 0; }
    if (!prevGround && this.onGround) this.onLand(g);
  }

  handleState(input, g) {
    const d = this.def;
    switch (this.state) {
      case 'idle': case 'run': case 'air': case 'crouch':
        this.actionable(input, g); break;
      case 'land':
        if (this.st >= this.landLag) { this.state = 'idle'; this.st = 0; }
        this.vx *= 0.8; break;
      case 'attack': this.attackUpdate(input, g); break;
      case 'charge':
        this.charge++;
        this.vx *= 0.7;
        if (this.charge % 6 === 0) Sound.play('charge', this.charge / 60);
        if (!input.attack || this.charge >= 60) {
          this.startMove(this.chargeMove, g, input, 1 + (this.charge / 60) * 0.45);
        }
        break;
      case 'hitstun':
        if (this.hitstun > 0) {
          this.hitstun--;
          // 簡易ベクトル変更（DI）
          if (!this.onGround) {
            if (input.left) this.vx -= 0.06;
            if (input.right) this.vx += 0.06;
          }
          if (Math.hypot(this.vx, this.vy) > 9 && g.frame % 2 === 0) g.addParticle(this.x, this.y, '#ffffff', 0.5);
        } else {
          this.state = this.onGround ? 'idle' : 'air'; this.st = 0; this.tumble = false;
        }
        if (this.onGround) this.vx *= 0.85;
        break;
      case 'shield':
        this.vx *= 0.7;
        this.shieldHP -= 0.14;
        if (this.shieldStun > 0) this.shieldStun--;
        if (this.shieldHP <= 0) { this.shieldBreak(g); break; }
        if (this.shieldStun === 0) {
          if (input.jumpP) { this.state = 'idle'; this.tryJump(input, g); }
          else if (input.down && (input.downP || this.dirTap.down > 0)) { this.state = 'spotdodge'; this.st = 0; Sound.play('dodge'); }
          else if (input.left && this.dirTap.left > 0) { this.state = 'roll'; this.st = 0; this.rollDir = -1; Sound.play('dodge'); }
          else if (input.right && this.dirTap.right > 0) { this.state = 'roll'; this.st = 0; this.rollDir = 1; Sound.play('dodge'); }
          else if (!input.shield) { this.state = 'idle'; this.st = 0; }
        }
        break;
      case 'spotdodge':
        this.vx = 0;
        if (this.st >= 24) { this.state = 'idle'; this.st = 0; }
        break;
      case 'roll':
        this.vx = this.st < 18 ? this.rollDir * 8.5 : 0;
        if (this.st >= 28) { this.state = 'idle'; this.st = 0; this.facing = -this.rollDir; }
        break;
      case 'airdodge':
        this.vx *= 0.9; this.vy *= 0.9;
        if (this.st >= 22) { this.state = 'air'; this.st = 0; }
        break;
      case 'helpless':
        if (input.left) this.vx = Math.max(this.vx - d.airAccel * 0.5, -d.airSpeed * 0.7);
        if (input.right) this.vx = Math.min(this.vx + d.airAccel * 0.5, d.airSpeed * 0.7);
        break;
      case 'ledge': this.ledgeUpdate(input, g); break;
      case 'knockdown':
        this.vx *= 0.8;
        if (this.st >= 36) { this.state = 'idle'; this.st = 0; this.invincible = Math.max(this.invincible, 8); }
        break;
      case 'shieldbreak':
        this.vx *= 0.9;
        if (this.st >= 150) { this.state = 'idle'; this.st = 0; }
        break;
      case 'respawn':
        this.vy = 0; this.vx = 0;
        if (this.st > 20 && (input.attackP || input.jumpP || input.left || input.right || input.down || input.specialP) || this.st > 110) {
          this.state = 'air'; this.st = 0;
        }
        break;
    }
  }

  actionable(input, g) {
    const d = this.def;
    if (this.onGround) {
      // シールド・回避
      if (input.shieldP || (input.shield && this.state !== 'shield')) {
        if (input.down) { this.state = 'spotdodge'; this.st = 0; Sound.play('dodge'); return; }
        if (input.left || input.right) { this.state = 'roll'; this.st = 0; this.rollDir = input.left ? -1 : 1; Sound.play('dodge'); return; }
        this.state = 'shield'; this.st = 0; this.vx = 0; Sound.play('shield'); return;
      }
      if (input.specialP) { this.trySpecial(input, g); return; }
      if (input.attackP) { this.tryGroundAttack(input, g); return; }
      if (input.jumpP) { this.tryJump(input, g); return; }
      // 台をすり抜けて落ちる
      if (this.platform && this.platform.soft && input.down && (input.downP || this.dirTap.down > 0) && this.state !== 'crouch') {
        this.dropTimer = 10; this.onGround = false; this.y += 4; this.state = 'air'; this.st = 0; return;
      }
      if (input.left !== input.right) {
        const dir = input.left ? -1 : 1;
        this.facing = dir;
        this.vx = lerp(this.vx, dir * d.speed, 0.28);
        if (this.state !== 'run') { this.state = 'run'; this.st = 0; }
        if (this.st % 8 === 0 && Math.abs(this.vx) > 3) g.addEffect('dust', this.x - dir * 10, this.y + this.h / 2, {});
      } else {
        this.vx *= 0.72; if (Math.abs(this.vx) < 0.3) this.vx = 0;
        if (input.down) { if (this.state !== 'crouch') { this.state = 'crouch'; this.st = 0; } }
        else if (this.state !== 'idle') { this.state = 'idle'; this.st = 0; }
      }
    } else {
      // 空中
      if (this.jumpTimer > 0) { this.jumpTimer--; if (!input.jump && this.vy < -6) { this.vy *= 0.55; this.jumpTimer = 0; } }
      if (input.shieldP && !this.airdodged) {
        this.state = 'airdodge'; this.st = 0; this.airdodged = true; Sound.play('dodge');
        if (input.left || input.right) this.vx = (input.left ? -1 : 1) * 6;
        if (input.up) this.vy = -5; if (input.down) this.vy = 6;
        return;
      }
      if (input.specialP) { this.trySpecial(input, g); return; }
      if (input.attackP) { this.tryAirAttack(input, g); return; }
      if (input.jumpP && this.jumps > 0) { this.tryJump(input, g); return; }
      this.airDrift(input, 1);
      if (input.downP && this.vy > 0 && !this.fastFalling) { this.fastFalling = true; g.addEffect('dust', this.x, this.y - this.h / 2, { color: 'rgba(255,255,255,0.5)' }); }
    }
  }

  airDrift(input, mult) {
    const d = this.def;
    const acc = d.airAccel * mult, max = d.airSpeed;
    if (input.left && this.vx > -max) this.vx = Math.max(this.vx - acc, -max);
    else if (input.right && this.vx < max) this.vx = Math.min(this.vx + acc, max);
    else this.vx *= 0.985;
  }

  tryJump(input, g) {
    const d = this.def;
    if (this.onGround) {
      this.vy = -d.jump; this.onGround = false; this.y -= 2; this.jumpTimer = 5;
      this.state = 'air'; this.st = 0;
      if (input.left) this.vx = Math.min(this.vx, -3); if (input.right) this.vx = Math.max(this.vx, 3);
      g.addEffect('dust', this.x, this.y + this.h / 2, {}); Sound.play('jump');
    } else if (this.jumps > 0) {
      this.jumps--; this.vy = -d.djump;
      if (input.left) this.vx = -d.airSpeed * 0.8; else if (input.right) this.vx = d.airSpeed * 0.8;
      this.state = 'air'; this.st = 0; this.fastFalling = false;
      g.addEffect('ring', this.x, this.y + this.h / 2, { color: 'rgba(255,255,255,0.7)', size: 30 }); Sound.play('djump');
    }
  }

  tryGroundAttack(input, g) {
    const tap = this.dirTap;
    if (this.state === 'run' && Math.abs(this.vx) > 3 && !input.up && !input.down) return this.startMove('dash', g, input);
    if (input.up) return tap.up > 0 ? this.startCharge('usmash') : this.startMove('utilt', g, input);
    if (input.down) return tap.down > 0 ? this.startCharge('dsmash') : this.startMove('dtilt', g, input);
    if (input.left !== input.right) {
      const dir = input.left ? -1 : 1; this.facing = dir;
      return (dir < 0 ? tap.left : tap.right) > 0 ? this.startCharge('fsmash') : this.startMove('ftilt', g, input);
    }
    return this.startMove('jab', g, input);
  }

  tryAirAttack(input, g) {
    if (input.up) return this.startMove('uair', g, input);
    if (input.down) return this.startMove('dair', g, input);
    if (input.left !== input.right) {
      const dir = input.left ? -1 : 1;
      return this.startMove(dir === this.facing ? 'fair' : 'bair', g, input);
    }
    return this.startMove('nair', g, input);
  }

  trySpecial(input, g) {
    if (input.up) return this.startMove('uspec', g, input);
    if (input.down) return this.startMove('dspec', g, input);
    if (input.left !== input.right) { this.facing = input.left ? -1 : 1; return this.startMove('sspec', g, input); }
    return this.startMove('nspec', g, input);
  }

  startCharge(key) {
    this.state = 'charge'; this.st = 0; this.charge = 0; this.chargeMove = key; this.vx = 0;
  }

  startMove(key, g, input, mult = 1) {
    const m = this.def.moves[key];
    if (!m) return false;
    this.state = 'attack'; this.st = 0; this.move = m; this.moveKey = key; this.moveFrame = 0;
    this.hitIds.clear(); this.dmgMult = mult; this.charge = 0;
    this.invisible = false;
    if (m.aerial && !this.onGround) this.fastFalling = false;
    if (m.onStart) m.onStart(this, g, input);
    if (!m.onStart && (m.hits.length || m.spawn)) Sound.play('swing');
    return true;
  }

  attackUpdate(input, g) {
    const m = this.move, f = this.moveFrame;
    if (!m) { this.state = this.onGround ? 'idle' : 'air'; return; }
    let moved = false;
    if (m.motion) for (const mo of m.motion) if (f >= mo.s && f <= mo.e) {
      if (mo.vx !== undefined) this.vx = mo.vx * this.facing;
      if (mo.vy !== undefined) { this.vy = mo.vy; this.noGravity = true; }
      moved = true;
    }
    if (m.onFrame) m.onFrame(this, g, f, input);
    if (m.spawn && f === m.spawn.frame) m.spawn.fn(this, g);
    if (m.trail && f % 2 === 0) g.addParticle(this.x - this.facing * 10, this.y + rand(-20, 20), m.trail, 0.8);
    if (!this.onGround && !moved && !this.noGravity) this.airDrift(input, 0.6);
    if (this.onGround && !moved) this.vx *= 0.8;
    if (m.next && input.attackP && f >= m.nextFrom && this.onGround) { this.startMove(m.next, g, input); return; }
    this.moveFrame++;
    if (this.moveFrame >= m.dur) {
      this.move = null; this.st = 0;
      if (m.helpless && !this.onGround) this.state = 'helpless';
      else this.state = this.onGround ? 'idle' : 'air';
    }
  }

  ledgeUpdate(input, g) {
    const L = this.ledge;
    this.vx = 0; this.vy = 0;
    this.x = L.x - L.dir * (this.w * 0.35); this.y = L.y + this.h * 0.45;
    this.facing = L.dir;
    const toward = L.dir > 0 ? input.right : input.left;
    const away = L.dir > 0 ? input.left : input.right;
    if (this.st < 6) return;
    if (input.jumpP || input.upP || input.up) {
      // 崖上がりジャンプ
      this.x = L.x + L.dir * 10; this.y = L.y - this.h / 2 - 2;
      this.vy = -this.def.jump * 0.85; this.state = 'air'; this.st = 0; this.ledgeCooldown = 20; this.invincible = 8;
      Sound.play('jump');
    } else if (toward || input.attackP) {
      this.x = L.x + L.dir * (this.w / 2 + 12); this.y = L.y - this.h / 2 - 1;
      this.state = 'idle'; this.st = 0; this.onGround = true; this.invincible = Math.max(this.invincible, 12);
      if (input.attackP) this.startMove('ftilt', g, input);
    } else if (away || input.down || this.st > 160) {
      this.state = 'air'; this.st = 0; this.y += 12; this.vy = 1; this.ledgeCooldown = 30;
    }
  }

  shieldBreak(g) {
    this.state = 'shieldbreak'; this.st = 0; this.shieldHP = this.def.shieldMax * 0.5;
    this.vy = -12; this.onGround = false;
    g.addEffect('ring', this.x, this.y, { color: '#ff4b4b', size: 70 }); g.shake(10); Sound.play('shieldBreak');
  }

  physics(g) {
    if (this.state === 'ledge' || this.state === 'respawn' || this.dead) return;
    const d = this.def;
    if (!this.onGround && !this.noGravity) {
      this.vy += d.gravity;
      const cap = this.fastFalling ? d.ffall : (this.state === 'hitstun' ? 14 : d.fall);
      if (this.vy > cap) this.vy = cap;
    }
    if (this.onGround && this.platform && this.platform.dx) this.x += this.platform.dx;
    const prevY = this.y;
    this.x += this.vx; this.y += this.vy;
    this.onGround = false; this.platform = null;
    const feet = this.y + this.h / 2, prevFeet = prevY + this.h / 2;
    const fw = this.w * 0.3;
    for (const p of g.stage.platforms) {
      const within = this.x + fw > p.x && this.x - fw < p.x + p.w;
      if (this.vy >= 0 && within && prevFeet <= p.y + 1.5 && feet >= p.y && !(p.soft && this.dropTimer > 0) && this.state !== 'shieldbreak_air') {
        this.y = p.y - this.h / 2; this.vy = 0; this.onGround = true; this.platform = p;
      } else if (!p.soft) {
        const hw = this.w / 2 * 0.8, hh = this.h / 2;
        if (this.x + hw > p.x && this.x - hw < p.x + p.w && this.y + hh > p.y && this.y - hh < p.y + p.h) {
          const prevHead = prevY - hh;
          if (this.vy < 0 && prevHead >= p.y + p.h - 1) { this.y = p.y + p.h + hh; this.vy = 0; }
          else {
            if (this.x < p.x + p.w / 2) this.x = p.x - hw; else this.x = p.x + p.w + hw;
            if (this.state === 'hitstun') this.vx *= -0.35; else this.vx = 0;
          }
        }
      }
    }
    if (this.onGround) this.fastFalling = false;
  }

  checkLedge(input, g) {
    if (this.onGround || this.ledgeCooldown > 0 || this.vy < -3) return;
    const ok = this.state === 'air' || this.state === 'helpless' || (this.state === 'attack' && this.move && this.move.helpless && this.moveFrame > 10);
    if (!ok || input.down) return;
    for (const L of g.stage.ledges) {
      const dx = (this.x - L.x) * L.dir; // 負ならステージ外側
      if (dx < 4 && dx > -50 && this.y > L.y - 30 && this.y < L.y + 80) {
        this.state = 'ledge'; this.st = 0; this.ledge = L; this.move = null;
        this.jumps = this.def.jumps; this.invincible = Math.max(this.invincible, 45); this.airdodged = false;
        this.fastFalling = false; this.vx = 0; this.vy = 0;
        g.addEffect('dust', L.x, L.y, {});
        return;
      }
    }
  }

  onLand(g) {
    const d = this.def;
    this.jumps = d.jumps; this.fastFalling = false; this.airdodged = false; this.jumpTimer = 0;
    g.addEffect('dust', this.x, this.y + this.h / 2, {}); Sound.play('land');
    switch (this.state) {
      case 'air': case 'helpless': case 'airdodge':
        this.state = 'land'; this.st = 0; this.landLag = this.state === 'airdodge' ? 10 : 4; break;
      case 'attack':
        if (this.move && this.move.aerial && !this.move.onLand) {
          if (this.move.helpless || this.moveKey.endsWith('air')) { this.move = null; this.state = 'land'; this.st = 0; this.landLag = 8; }
        } else if (this.move && this.move.onLand) { this.move.onLand(this, g); }
        break;
      case 'hitstun':
        this.hitstun = 0;
        if (this.tumble) { this.state = 'knockdown'; this.st = 0; this.tumble = false; g.shake(3); }
        else { this.state = 'land'; this.st = 0; this.landLag = 6; }
        break;
      case 'shieldbreak':
        break;
    }
  }
}

/* ---------------------------------------------------------------------
   CPU AI
--------------------------------------------------------------------- */
function cpuInput(f, g) {
  const inp = emptyInput();
  const ai = f.ai, lvl = f.level;
  const st = g.stage, m = st.main;
  const enemies = g.fighters.filter(o => o !== f && o.alive);
  const enemy = enemies.sort((a, b) => Math.abs(a.x - f.x) - Math.abs(b.x - f.x))[0];
  ai.cool--; ai.wander--; ai.shieldT--;
  const err = (10 - lvl) * 0.012; // ミス確率
  const stageL = m.x, stageR = m.x + m.w, cx = m.x + m.w / 2;
  const offStage = f.x < stageL - 5 || f.x > stageR + 5 || f.y > m.y + 30;

  if (f.state === 'respawn') { if (f.st > 30) inp.down = true; return inp; }
  if (f.state === 'ledge') {
    if (f.st > 18 + (10 - lvl) * 4) { if (Math.random() < 0.5) inp.up = true; else { if (f.ledge.dir > 0) inp.right = true; else inp.left = true; } }
    return inp;
  }
  if (f.state === 'hitstun') { // 簡易DI: ステージ側へ
    if (f.x < cx) inp.right = true; else inp.left = true;
    return inp;
  }
  if (f.state === 'shield') {
    if (ai.shieldT > 0) inp.shield = true;
    else if (enemy && Math.abs(enemy.x - f.x) < 90 && Math.random() < 0.5) { inp.shield = true; if (enemy.x > f.x) inp.right = true; else inp.left = true; inp.smash = true; }
    return inp;
  }

  // ---- 復帰 ----
  if (offStage) {
    const dir = f.x < cx ? 1 : -1;
    if (dir > 0) inp.right = true; else inp.left = true;
    if (!f.onGround) {
      const belowEdge = f.y > m.y - 20;
      const farX = Math.abs(f.x - (dir > 0 ? stageL : stageR));
      if (f.state === 'air') {
        if (f.jumps > 0 && f.vy > 3 && Math.random() < 0.35) inp.jump = true;
        else if (f.jumps === 0 && (f.vy > 2 || belowEdge) && farX < 260 && Math.random() < 0.6) { inp.special = true; inp.up = true; }
        else if (f.jumps === 0 && farX >= 260 && f.def.moves.sspec && Math.random() < 0.3 && f.y < m.y + 80) { inp.special = true; }
      }
    }
    return finishInput(inp, f.prevAI || emptyInput()), f.prevAI = inp, inp;
  }

  if (!enemy) { if (Math.abs(f.x - cx) > 40) { if (f.x < cx) inp.right = true; else inp.left = true; } return finishAI(f, inp); }

  const dx = enemy.x - f.x, dy = enemy.y - f.y, adx = Math.abs(dx);
  const dir = dx > 0 ? 1 : -1;
  const reach = 60 * f.def.reach + 20;
  const enemyAttacking = enemy.state === 'attack' && enemy.move && enemy.move.hits.length > 0 && enemy.moveFrame < 14;

  // 防御
  if (f.onGround && enemyAttacking && adx < 140 && Math.random() < 0.35 + lvl * 0.05 && f.shieldHP > 15) {
    inp.shield = true; ai.shieldT = 14; return finishAI(f, inp);
  }
  // 敵の飛び道具回避
  for (const p of g.projectiles) {
    if (p.owner !== f && Math.abs(p.x - f.x) < 110 && Math.abs(p.y - f.y) < 50 && Math.sign(p.vx) === -Math.sign(p.x - f.x) && Math.random() < 0.3 + lvl * 0.05) {
      if (f.onGround) { inp.shield = true; ai.shieldT = 10; } else if (f.jumps > 0) inp.jump = true;
      return finishAI(f, inp);
    }
  }

  // 敵が場外のときは深追いしない
  const enemyOff = enemy.x < stageL - 40 || enemy.x > stageR + 40;
  if (enemyOff) {
    const edgeX = enemy.x < stageL ? stageL + 40 : stageR - 40;
    if (Math.abs(f.x - edgeX) > 20) { if (f.x < edgeX) inp.right = true; else inp.left = true; }
    else if (adx < 120 && Math.abs(dy) < 80 && ai.cool <= 0 && Math.random() < 0.4) {
      if (dir > 0) inp.right = true; else inp.left = true; inp.attack = true; inp.smash = Math.random() < 0.5; ai.cool = 30;
    }
    if (f.onGround && enemy.y > m.y && Math.random() < 0.002 * lvl && f.def.moves.nspec) { inp.special = true; }
    return finishAI(f, inp);
  }

  // 接近 / 攻撃
  if (adx > reach + 20 || Math.abs(dy) > 90) {
    if (Math.random() > err) { if (dir > 0) inp.right = true; else inp.left = true; }
    if (dy < -80 && f.onGround && Math.random() < 0.05 + lvl * 0.01) inp.jump = true;
    if (!f.onGround && dy < -60 && f.jumps > 0 && Math.random() < 0.05) inp.jump = true;
    if (!f.onGround && dy > 60 && Math.random() < 0.05) inp.down = true;
    if (adx > 300 && f.onGround && Math.random() < 0.004 * lvl && ai.cool <= 0) { inp.special = true; ai.cool = 40; }
    if (adx > 150 && adx < 400 && f.onGround && Math.random() < 0.002 * lvl && ai.cool <= 0) {
      if (dir > 0) inp.right = true; else inp.left = true; inp.special = true; ai.cool = 45;
    }
    // 空中の敵に対して対空
    if (f.onGround && dy < -50 && adx < 90 && ai.cool <= 0 && Math.random() < 0.2) { inp.up = true; inp.attack = true; inp.smash = Math.random() < 0.4; ai.cool = 30; }
  } else if (ai.cool <= 0 && Math.random() > err * 2) {
    const r = Math.random();
    if (f.onGround) {
      if (dy < -50) { inp.up = true; inp.attack = true; inp.smash = r < 0.5; }
      else if (r < 0.22) { inp.attack = true; }
      else if (r < 0.42) { if (dir > 0) inp.right = true; else inp.left = true; inp.attack = true; }
      else if (r < 0.62) { if (dir > 0) inp.right = true; else inp.left = true; inp.attack = true; inp.smash = true; }
      else if (r < 0.72) { inp.down = true; inp.attack = true; inp.smash = r < 0.67; }
      else if (r < 0.82) { inp.special = true; if (Math.random() < 0.5) { if (dir > 0) inp.right = true; else inp.left = true; } else if (Math.random() < 0.3) inp.down = true; }
      else if (r < 0.9) { inp.jump = true; }
      else { if (dir > 0) inp.right = true; else inp.left = true; inp.shield = true; inp.smash = true; }
    } else {
      if (dy > 40) { inp.down = true; inp.attack = true; }
      else if (dy < -40) { inp.up = true; inp.attack = true; }
      else if (r < 0.5) { if (dir > 0) inp.right = true; else inp.left = true; inp.attack = true; }
      else inp.attack = true;
    }
    ai.cool = Math.max(6, 34 - lvl * 2.5 + randi(0, 12));
    f.smashHold = inp.smash ? 20 + randi(0, 30) : 0;
  } else if (ai.wander <= 0) {
    ai.wander = randi(10, 30);
    ai.wdir = Math.random() < 0.6 ? dir : -dir;
    if (Math.random() < 0.08) inp.jump = true;
  } else {
    if (ai.wdir > 0) inp.right = true; else inp.left = true;
  }
  // スマッシュチャージ維持
  if (f.state === 'charge') { inp.attack = f.smashHold > f.charge; }
  // 短ジャンプ空中攻撃
  if (!f.onGround && f.state === 'air' && adx < reach + 30 && Math.abs(dy) < 60 && ai.cool <= 0 && Math.random() < 0.3) {
    inp.attack = true; if (dir !== f.facing) { if (dir > 0) inp.right = true; else inp.left = true; }
    ai.cool = 20;
  }
  return finishAI(f, inp);
}
function finishAI(f, inp) {
  finishInput(inp, f.prevAI || emptyInput());
  f.prevAI = inp;
  return inp;
}

/* ---------------------------------------------------------------------
   ゲーム（試合）
--------------------------------------------------------------------- */
class Game {
  constructor(settings) {
    this.settings = settings;
    this.stage = STAGES[settings.stage];
    for (const p of this.stage.platforms) { if (p.move) { p.x = p.move.x0; } p.dx = 0; }
    this.fighters = settings.players.map((p, i) => {
      const f = new Fighter(CHARACTERS[p.char], i, { cpu: p.cpu, level: p.level, stocks: settings.stocks });
      f.spawnAt(this.stage.spawns[i]);
      f.facing = i % 2 === 0 ? 1 : -1;
      return f;
    });
    this.projectiles = []; this.effects = []; this.particles = [];
    this.frame = 0; this.phase = 'countdown'; this.phaseT = 0;
    this.timer = settings.time * 60 * 60;
    this.shakeAmt = 0; this.cam = { x: W / 2, y: H / 2 - 40, zoom: 1 };
    this.koText = 0; this.paused = false; this.winner = null; this.hitboxDebug = false;
    this.messages = [];
  }

  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }
  addEffect(type, x, y, o) { this.effects.push({ type, x, y, t: 0, life: o.life || (type === 'ko' ? 50 : type === 'ring' ? 22 : 18), ...o }); }
  addParticle(x, y, color, size = 1) {
    this.particles.push({ x, y, vx: rand(-1.5, 1.5), vy: rand(-1.5, 1.5), life: randi(12, 24), color, r: rand(3, 7) * size });
  }
  spawnProjectile(p) { this.projectiles.push({ gravity: 0, t: 0, ...p }); }

  update() {
    if (this.paused) return;
    this.frame++;
    if (this.shakeAmt > 0) this.shakeAmt *= 0.85; if (this.shakeAmt < 0.3) this.shakeAmt = 0;
    if (this.koText > 0) this.koText--;
    for (const p of this.stage.platforms) if (p.move) {
      const t = (this.frame / p.move.period) * Math.PI * 2;
      const nx = lerp(p.move.x0, p.move.x1 - p.w, (Math.sin(t) + 1) / 2);
      p.dx = nx - p.x; p.x = nx;
    }
    if (this.phase === 'countdown') {
      this.phaseT++;
      if (this.phaseT === 1 || this.phaseT === 60 || this.phaseT === 120) Sound.play('count');
      if (this.phaseT === 180) Sound.play('go');
      if (this.phaseT >= 200) { this.phase = 'play'; this.phaseT = 0; }
      for (const f of this.fighters) f.update(emptyInput(), this);
      this.updateEffects();
      this.updateCamera();
      return;
    }
    if (this.phase === 'play' && this.timer > 0) {
      this.timer--;
      if (this.timer === 0) this.endMatch();
    }
    const inputs = this.fighters.map(f => {
      if (this.phase !== 'play') return emptyInput();
      if (f.cpu) return cpuInput(f, this);
      return getPlayerInput(f.index);
    });
    this.fighters.forEach((f, i) => f.update(inputs[i], this));
    this.updateProjectiles();
    this.checkHits();
    this.checkBlastZones();
    this.updateEffects();
    this.updateCamera();
    if (this.phase === 'play') {
      const remaining = this.fighters.filter(f => f.stocks > 0);
      if (remaining.length <= 1) this.endMatch();
    } else if (this.phase === 'end') {
      this.phaseT++;
      if (this.phaseT > 150) { scene = new ResultScene(this); }
    }
  }

  endMatch() {
    if (this.phase === 'end') return;
    this.phase = 'end'; this.phaseT = 0; Sound.play('game');
    const ranked = [...this.fighters].sort((a, b) => (b.stocks - a.stocks) || (a.percent - b.percent));
    this.winner = ranked[0];
    this.ranked = ranked;
    for (const f of this.fighters) { f.hitlag = 0; }
  }

  updateProjectiles() {
    for (const p of this.projectiles) {
      p.t++; p.life--;
      p.vy += p.gravity;
      p.x += p.vx; p.y += p.vy;
      if (p.t % 3 === 0) this.addParticle(p.x, p.y, p.color, 0.6);
      const b = this.stage.blast;
      if (p.x < b.l || p.x > b.r || p.y < b.t || p.y > b.b) p.life = 0;
      for (const pl of this.stage.platforms) {
        if (!pl.soft && circleRect(p.x, p.y, p.r, pl.x, pl.y, pl.w, pl.h)) { p.life = 0; this.addEffect('spark', p.x, p.y, { size: 14, color: p.color }); }
      }
      if (p.life > 0) for (const t of this.fighters) {
        if (t === p.owner || !t.alive || t.isInvulnerable()) continue;
        const r = t.rect;
        if (circleRect(p.x, p.y, p.r, r.x, r.y, r.w, r.h)) {
          const dir = Math.sign(p.vx) || p.owner.facing;
          this.resolveHit(p.owner, t, p, p.x, p.y, dir, true);
          p.life = 0;
          break;
        }
      }
    }
    this.projectiles = this.projectiles.filter(p => p.life > 0);
  }

  checkHits() {
    for (const f of this.fighters) {
      if (!f.alive || f.state !== 'attack' || !f.move || f.hitlag > 0) continue;
      const fr = f.moveFrame - 1; // 更新済みなので1フレーム前が現在の判定
      for (const hb of f.move.hits) {
        if (fr < hb.s || fr > hb.e) continue;
        const hx = f.x + hb.x * f.facing, hy = f.y + hb.y;
        for (const t of this.fighters) {
          if (t === f || !t.alive || f.hitIds.has(t.id) || t.isInvulnerable()) continue;
          const r = t.rect;
          if (circleRect(hx, hy, hb.r, r.x, r.y, r.w, r.h)) {
            const dir = hb.x !== 0 ? Math.sign(hb.x) * f.facing : (Math.sign(t.x - f.x) || f.facing);
            this.resolveHit(f, t, hb, hx, hy, dir, false);
          }
        }
      }
    }
  }

  knockback(percent, dmg, weight, bkb, kbg) {
    return ((((percent / 10) + (percent * dmg / 20)) * (200 / (weight + 100)) * 1.4) + 18) * (kbg / 100) + bkb;
  }

  resolveHit(att, t, hb, hx, hy, dir, isProj) {
    if (!isProj) att.hitIds.add(t.id);
    const dmg = Math.round(hb.dmg * (isProj ? 1 : att.dmgMult) * 10) / 10;

    // カウンター
    if (t.counter > 0 && !isProj) {
      t.counter = 0; t.move = null;
      t.facing = Math.sign(att.x - t.x) || t.facing;
      t.startMove('counterhit', this, null, Math.max(1, dmg * 1.4 / 10));
      att.hitlag = 10; t.hitlag = 6;
      this.addEffect('ring', t.x, t.y, { color: '#ffffff', size: 60 }); Sound.play('counter');
      return;
    }
    // シールド
    if (t.state === 'shield') {
      t.shieldHP -= dmg * 0.9; t.shieldStun = Math.floor(dmg * 0.6) + 4;
      t.vx = dir * dmg * 0.35; if (!isProj) att.vx -= dir * 1.5;
      att.hitlag = 4; t.hitlag = 4;
      this.addEffect('spark', hx, hy, { size: 12, color: '#9ad7ff' }); Sound.play('shieldHit');
      if (t.shieldHP <= 0) t.shieldBreak(this);
      return;
    }
    const ang = hb.ang === 361 ? (t.onGround && t.percent < 60 ? 0 : 40) : hb.ang;
    t.percent = Math.round((t.percent + dmg) * 10) / 10;
    att.damageDealt += dmg;
    let kb = this.knockback(t.percent, dmg, t.def.weight, hb.bkb, hb.kbg);
    const armor = t.getArmor();
    const hl = clamp(Math.floor(dmg * 0.55) + 3, 3, 22);
    att.hitlag = hl; t.hitlag = hl;
    t.lastHitBy = att; t.lastHitTimer = 300;
    if (armor > 0 && kb < armor) {
      this.addEffect('spark', hx, hy, { size: 10, color: '#c8b08a' }); Sound.play('hit');
      return;
    }
    const a = ang * DEG;
    let vx = Math.cos(a) * kb * KB_SCALE * dir, vy = -Math.sin(a) * kb * KB_SCALE;
    if (ang === 0 && t.onGround) vy = -1.5;
    if (t.onGround && vy > 0) vy = -vy * 0.6; // 地面へのメテオは跳ね返る
    t.vx = vx; t.vy = vy; t.onGround = vy >= 0 && t.onGround && ang === 0;
    if (vy < 0) t.onGround = false;
    t.hitstun = Math.floor(kb * HITSTUN_SCALE) + (hb.extraStun || 0);
    t.tumble = kb > 85;
    t.lastKB = kb;
    t.state = 'hitstun'; t.st = 0; t.move = null; t.charge = 0; t.counter = 0; t.invisible = false; t.noGravity = false;
    t.facing = -dir;
    t.fastFalling = false;
    const strength = kb > 120 ? 2 : kb > 70 ? 1 : 0;
    this.addEffect('spark', hx, hy, { size: 14 + dmg * 1.4, color: strength === 2 ? '#ff3b3b' : strength === 1 ? '#ffb52e' : '#ffffff' });
    this.shake(strength === 2 ? 10 : strength === 1 ? 5 : 2);
    Sound.play(strength >= 1 ? 'hitHeavy' : 'hit');
    if (strength === 2) this.addEffect('kotext', t.x, t.y - 60, { text: 'SMASH!', color: '#ff3b3b', life: 30 });
    for (let i = 0; i < 6 + strength * 4; i++) this.addParticle(hx, hy, '#ffe680', 1);
  }

  checkBlastZones() {
    const b = this.stage.blast;
    for (const f of this.fighters) {
      if (!f.alive) continue;
      if (f.x < b.l || f.x > b.r || f.y < b.t || f.y > b.b) this.ko(f);
    }
  }

  ko(f) {
    const b = this.stage.blast;
    const ex = clamp(f.x, b.l + 20, b.r - 20), ey = clamp(f.y, b.t + 20, b.b - 20);
    this.addEffect('ko', ex, ey, { color: f.color, dir: f.x < W / 2 ? -1 : 1, up: f.y < 0 });
    this.shake(18); Sound.play('ko');
    f.stocks--; f.falls++; f.dead = true; f.respawnTimer = 100; f.state = 'dead'; f.move = null;
    f.percent = 0; f.hitstun = 0;
    if (f.lastHitBy && f.lastHitBy !== f) f.lastHitBy.kos++;
    this.koText = 60; this.koVictim = f;
  }

  updateEffects() {
    for (const e of this.effects) e.t++;
    this.effects = this.effects.filter(e => e.t < e.life);
    for (const p of this.particles) { p.x += p.vx; p.y += p.vy; p.life--; p.r *= 0.93; }
    this.particles = this.particles.filter(p => p.life > 0);
  }

  updateCamera() {
    const targets = this.fighters.filter(f => f.alive);
    const b = this.stage.blast;
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (const f of targets) {
      minx = Math.min(minx, f.x); maxx = Math.max(maxx, f.x); miny = Math.min(miny, f.y); maxy = Math.max(maxy, f.y);
    }
    if (targets.length === 0) { minx = W / 2 - 200; maxx = W / 2 + 200; miny = H / 2 - 100; maxy = H / 2 + 100; }
    // ステージ本体も常に含める
    const m = this.stage.main;
    minx = Math.min(minx, m.x + 100); maxx = Math.max(maxx, m.x + m.w - 100);
    miny = Math.min(miny, m.y - 260); maxy = Math.max(maxy, m.y + 40);
    const padX = 220, padY = 160;
    const bw = (maxx - minx) + padX * 2, bh = (maxy - miny) + padY * 2;
    let zoom = clamp(Math.min(W / bw, H / bh), 0.72, 1.18);
    const cx = clamp((minx + maxx) / 2, b.l + 200, b.r - 200);
    const cy = clamp((miny + maxy) / 2, b.t + 200, b.b - 200);
    this.cam.zoom = lerp(this.cam.zoom, zoom, 0.06);
    this.cam.x = lerp(this.cam.x, cx, 0.08);
    this.cam.y = lerp(this.cam.y, cy, 0.08);
  }

  /* --------- 描画 --------- */
  draw() {
    drawBackground(this.stage.theme, this.frame);
    ctx.save();
    const sx = this.shakeAmt ? rand(-this.shakeAmt, this.shakeAmt) : 0, sy = this.shakeAmt ? rand(-this.shakeAmt, this.shakeAmt) : 0;
    ctx.translate(W / 2 + sx, H / 2 + sy);
    ctx.scale(this.cam.zoom, this.cam.zoom);
    ctx.translate(-this.cam.x, -this.cam.y);
    drawPlatforms(this.stage);
    for (const f of this.fighters) if (!f.dead) drawFighter(f, this);
    for (const p of this.particles) {
      ctx.globalAlpha = clamp(p.life / 12, 0, 1); ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const p of this.projectiles) drawProjectile(p, this.frame);
    for (const e of this.effects) drawEffect(e);
    if (this.hitboxDebug) drawHitboxes(this);
    // 画面外インジケーター
    ctx.restore();
    this.drawOffscreenMarkers();
    this.drawHUD();
    if (this.phase === 'countdown') this.drawCountdown();
    if (this.phase === 'end') this.drawGameText();
    if (this.koText > 0) {
      ctx.save(); ctx.globalAlpha = Math.min(1, this.koText / 15);
      ctx.fillStyle = 'rgba(255,255,255,' + (this.koText > 50 ? 0.5 : 0) + ')'; ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    if (this.paused) this.drawPause();
  }

  worldToScreen(x, y) {
    return { x: (x - this.cam.x) * this.cam.zoom + W / 2, y: (y - this.cam.y) * this.cam.zoom + H / 2 };
  }

  drawOffscreenMarkers() {
    for (const f of this.fighters) {
      if (!f.alive) continue;
      const s = this.worldToScreen(f.x, f.y);
      if (s.x > 20 && s.x < W - 20 && s.y > 20 && s.y < H - 20) continue;
      const mx = clamp(s.x, 40, W - 40), my = clamp(s.y, 40, H - 120);
      ctx.save(); ctx.translate(mx, my);
      ctx.fillStyle = f.color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      const ang = Math.atan2(s.y - my, s.x - mx);
      ctx.rotate(ang); ctx.beginPath(); ctx.moveTo(24, -10); ctx.lineTo(38, 0); ctx.lineTo(24, 10); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.rotate(-ang);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(PLAYER_NAMES[f.index], 0, 0);
      ctx.restore();
    }
  }

  drawHUD() {
    const n = this.fighters.length;
    const cardW = 250, gap = 40;
    const totalW = n * cardW + (n - 1) * gap;
    const x0 = (W - totalW) / 2;
    this.fighters.forEach((f, i) => {
      const x = x0 + i * (cardW + gap), y = H - 120;
      ctx.save();
      ctx.globalAlpha = f.stocks <= 0 ? 0.4 : 1;
      // 背景
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      roundRect(x, y, cardW, 100, 12); ctx.fill();
      ctx.strokeStyle = f.color; ctx.lineWidth = 3; roundRect(x, y, cardW, 100, 12); ctx.stroke();
      // ポートレート
      ctx.save(); ctx.translate(x + 48, y + 52);
      ctx.beginPath(); ctx.arc(0, 0, 36, 0, Math.PI * 2); ctx.fillStyle = f.def.colors.dark; ctx.fill();
      ctx.clip(); ctx.scale(0.75, 0.75); ctx.translate(0, 20);
      drawFighterBody(f, { armF: 15, armB: -15, legF: 8, legB: -8, tilt: 0, sx: 1, sy: 1, dy: 0 }, this.frame, true);
      ctx.restore();
      // 名前とプレイヤー
      ctx.fillStyle = f.color; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(PLAYER_NAMES[f.index] + (f.cpu ? ' CPU Lv' + f.level : ''), x + 96, y + 24);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif';
      ctx.fillText(f.def.name, x + 96, y + 44);
      // ダメージ％
      const pc = f.percent;
      const col = pc < 40 ? '#ffffff' : pc < 80 ? '#ffd23e' : pc < 120 ? '#ff8a1e' : pc < 160 ? '#ff3b3b' : '#8a0000';
      ctx.font = 'bold 40px "Arial Black", sans-serif'; ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(Math.floor(pc) + '%', x + cardW - 12 + 2, y + 86 + 2);
      ctx.fillStyle = f.dead ? '#888' : col; ctx.fillText(Math.floor(pc) + '%', x + cardW - 12, y + 86);
      // ストック
      for (let s = 0; s < f.stocks; s++) {
        ctx.beginPath(); ctx.arc(x + 104 + s * 20, y + 68, 7, 0, Math.PI * 2);
        ctx.fillStyle = f.def.colors.body; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      }
      ctx.restore();
    });
    // タイマー
    if (this.settings.time > 0) {
      const sec = Math.ceil(this.timer / 60);
      const mm = Math.floor(sec / 60), ss = sec % 60;
      ctx.font = 'bold 34px "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(mm + ':' + String(ss).padStart(2, '0'), W / 2 + 2, 14);
      ctx.fillStyle = sec <= 10 ? '#ff3b3b' : '#fff'; ctx.fillText(mm + ':' + String(ss).padStart(2, '0'), W / 2, 12);
    }
  }

  drawCountdown() {
    const t = this.phaseT;
    let text = '', p = 0;
    if (t < 60) { text = '3'; p = t / 60; } else if (t < 120) { text = '2'; p = (t - 60) / 60; } else if (t < 180) { text = '1'; p = (t - 120) / 60; } else { text = 'GO!'; p = (t - 180) / 20; }
    const s = text === 'GO!' ? 1 + p * 0.6 : 1.6 - easeOut(Math.min(1, p * 2)) * 0.6;
    ctx.save(); ctx.translate(W / 2, H / 2 - 40); ctx.scale(s, s);
    ctx.font = 'bold 120px "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 12; ctx.strokeStyle = '#000'; ctx.strokeText(text, 0, 0);
    ctx.fillStyle = text === 'GO!' ? '#ffd23e' : '#fff'; ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  drawGameText() {
    const p = Math.min(1, this.phaseT / 20);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,' + 0.4 * p + ')'; ctx.fillRect(0, 0, W, H);
    ctx.translate(W / 2, H / 2 - 40); ctx.scale(2 - easeOut(p), 2 - easeOut(p));
    ctx.font = 'bold 130px "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 14; ctx.strokeStyle = '#000'; ctx.strokeText(this.timer === 0 && this.settings.time > 0 ? 'TIME!' : 'GAME!', 0, 0);
    ctx.fillStyle = '#ffd23e'; ctx.fillText(this.timer === 0 && this.settings.time > 0 ? 'TIME!' : 'GAME!', 0, 0);
    ctx.restore();
  }

  drawPause() {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff'; ctx.font = 'bold 70px sans-serif'; ctx.fillText('PAUSE', W / 2, H / 2 - 40);
    ctx.font = '22px sans-serif'; ctx.fillStyle = '#ccc';
    ctx.fillText('Esc / P : 再開　　Q : キャラ選択に戻る　　F1 : 判定表示', W / 2, H / 2 + 30);
    ctx.restore();
  }
}

/* ---------------------------------------------------------------------
   描画：背景・ステージ
--------------------------------------------------------------------- */
const stars = Array.from({ length: 120 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.8 + 0.4, p: Math.random() * 10 }));
const clouds = Array.from({ length: 8 }, (_, i) => ({ x: Math.random() * W, y: 60 + Math.random() * 300, s: 0.6 + Math.random() * 0.8, v: 0.15 + Math.random() * 0.25 }));

function drawBackground(theme, frame) {
  if (theme === 'sky') {
    const gr = ctx.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#2b6bd6'); gr.addColorStop(0.6, '#79b8f2'); gr.addColorStop(1, '#d6ecff');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    // 太陽
    ctx.fillStyle = 'rgba(255,240,180,0.9)'; ctx.beginPath(); ctx.arc(1080, 110, 60, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,240,180,0.25)'; ctx.beginPath(); ctx.arc(1080, 110, 110, 0, Math.PI * 2); ctx.fill();
    for (const c of clouds) {
      c.x -= c.v; if (c.x < -200) c.x = W + 200;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(c.x + i * 40 * c.s, c.y + (i % 2) * 10 * c.s, (30 + (i % 3) * 10) * c.s, 0, Math.PI * 2); ctx.fill(); }
    }
    // 遠景の島
    ctx.fillStyle = 'rgba(40,90,60,0.35)';
    ctx.beginPath(); ctx.ellipse(200, 650, 220, 60, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(1100, 680, 260, 70, 0, 0, Math.PI * 2); ctx.fill();
  } else if (theme === 'space') {
    const gr = ctx.createRadialGradient(W * 0.3, H * 0.4, 50, W / 2, H / 2, 900);
    gr.addColorStop(0, '#2a1a5e'); gr.addColorStop(0.5, '#0f0a2a'); gr.addColorStop(1, '#03020a');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    for (const s of stars) {
      const a = 0.4 + 0.6 * Math.abs(Math.sin(frame * 0.02 + s.p));
      ctx.fillStyle = 'rgba(255,255,255,' + a + ')'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    }
    // 星雲
    ctx.save(); ctx.globalAlpha = 0.25;
    const n = ctx.createRadialGradient(900, 200, 10, 900, 200, 300);
    n.addColorStop(0, '#ff5ad6'); n.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = n; ctx.fillRect(0, 0, W, H);
    const n2 = ctx.createRadialGradient(250, 500, 10, 250, 500, 350);
    n2.addColorStop(0, '#3ad6ff'); n2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = n2; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  } else {
    const gr = ctx.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#1a1033'); gr.addColorStop(0.5, '#4a2c6b'); gr.addColorStop(1, '#f28c5a');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    for (const s of stars) { if (s.y > 350) continue; ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 0.8, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#ffd9a0'; ctx.beginPath(); ctx.arc(200, 160, 50, 0, Math.PI * 2); ctx.fill();
    // ビル群
    for (let i = 0; i < 26; i++) {
      const bx = i * 52 - 20, bh = 120 + ((i * 7919) % 220);
      ctx.fillStyle = 'rgba(20,10,40,' + (0.7 + (i % 3) * 0.1) + ')';
      ctx.fillRect(bx, H - bh, 44, bh);
      ctx.fillStyle = 'rgba(255,220,120,0.5)';
      for (let wy = H - bh + 12; wy < H - 20; wy += 22) for (let wx = 0; wx < 3; wx++) if (((i * 13 + wy) % 7) < 4) ctx.fillRect(bx + 6 + wx * 13, wy, 7, 10);
    }
    for (const c of clouds) {
      c.x -= c.v * 0.6; if (c.x < -200) c.x = W + 200;
      ctx.fillStyle = 'rgba(255,200,230,0.25)';
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(c.x + i * 40 * c.s, c.y + 200 + (i % 2) * 10 * c.s, (30 + (i % 3) * 10) * c.s, 0, Math.PI * 2); ctx.fill(); }
    }
  }
}

function drawPlatforms(stage) {
  for (const p of stage.platforms) {
    if (p.main) {
      if (stage.theme === 'sky') {
        ctx.fillStyle = '#6b4a2b'; roundRect(p.x, p.y, p.w, p.h, 12); ctx.fill();
        ctx.fillStyle = '#4a3220'; ctx.beginPath(); ctx.moveTo(p.x + 20, p.y + p.h); ctx.lineTo(p.x + p.w - 20, p.y + p.h); ctx.lineTo(p.x + p.w / 2 + 120, p.y + p.h + 90); ctx.lineTo(p.x + p.w / 2 - 120, p.y + p.h + 90); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#5ab04a'; roundRect(p.x, p.y, p.w, 16, 8); ctx.fill();
        ctx.fillStyle = '#7bd66b'; ctx.fillRect(p.x + 6, p.y, p.w - 12, 6);
      } else if (stage.theme === 'space') {
        const g = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
        g.addColorStop(0, '#5a5f8a'); g.addColorStop(1, '#1f2140');
        ctx.fillStyle = g; roundRect(p.x, p.y, p.w, p.h, 6); ctx.fill();
        ctx.fillStyle = '#9ad7ff'; ctx.fillRect(p.x, p.y, p.w, 5);
        ctx.strokeStyle = 'rgba(154,215,255,0.5)'; ctx.lineWidth = 2;
        for (let i = 1; i < 8; i++) { ctx.beginPath(); ctx.moveTo(p.x + i * p.w / 8, p.y + 10); ctx.lineTo(p.x + i * p.w / 8, p.y + p.h - 8); ctx.stroke(); }
        ctx.fillStyle = 'rgba(154,215,255,0.35)'; ctx.fillRect(p.x + 20, p.y + p.h, p.w - 40, 160);
      } else {
        ctx.fillStyle = '#3a3a55'; ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.fillStyle = '#2b2b40'; ctx.fillRect(p.x + 30, p.y + p.h, p.w - 60, 400);
        ctx.fillStyle = '#c9c9e0'; ctx.fillRect(p.x, p.y, p.w, 8);
        ctx.fillStyle = 'rgba(255,220,120,0.6)';
        for (let wy = p.y + 30; wy < p.y + p.h - 10; wy += 30) for (let wx = p.x + 20; wx < p.x + p.w - 20; wx += 40) ctx.fillRect(wx, wy, 16, 14);
      }
    } else {
      ctx.fillStyle = stage.theme === 'sky' ? '#8c6a3f' : stage.theme === 'space' ? '#7a80b0' : '#5a5a7a';
      roundRect(p.x, p.y, p.w, p.h, 6); ctx.fill();
      ctx.fillStyle = stage.theme === 'sky' ? '#7bd66b' : stage.theme === 'space' ? '#c8f0ff' : '#e0e0f0';
      ctx.fillRect(p.x, p.y, p.w, 4);
    }
  }
}

/* ---------------------------------------------------------------------
   描画：ファイター
--------------------------------------------------------------------- */
function computePose(f) {
  const pose = { armF: 15, armB: -15, legF: 8, legB: -8, tilt: 0, sx: 1, sy: 1, dy: 0, rot: 0, eyes: 'normal', dx: 0 };
  const t = f.anim;
  switch (f.state) {
    case 'idle': case 'respawn':
      pose.armF = 15 + Math.sin(t * 0.08) * 4; pose.armB = -15 - Math.sin(t * 0.08) * 4; pose.sy = 1 + Math.sin(t * 0.08) * 0.015; break;
    case 'crouch': pose.sy = 0.75; pose.dy = f.h * 0.12; pose.armF = 40; pose.armB = 20; pose.legF = 40; pose.legB = -40; break;
    case 'run': {
      const s = Math.sin(t * 0.38);
      pose.armF = 20 + s * 55; pose.armB = 20 - s * 55; pose.legF = s * 50; pose.legB = -s * 50; pose.tilt = 0.18; pose.dy = Math.abs(s) * -3; break;
    }
    case 'air': case 'helpless': case 'airdodge':
      pose.armF = 120; pose.armB = 110; pose.legF = 30; pose.legB = -20;
      if (f.vy < 0) { pose.armF = 150; pose.armB = 140; pose.sy = 1.08; pose.sx = 0.94; }
      if (f.state === 'helpless') { pose.armF = 160 + Math.sin(t * 0.5) * 20; pose.armB = 160 - Math.sin(t * 0.5) * 20; pose.tilt = Math.sin(t * 0.3) * 0.2; pose.eyes = 'dizzy'; }
      if (f.state === 'airdodge') { pose.rot = f.st * 0.3; pose.sx = 0.9; pose.sy = 0.9; }
      break;
    case 'land': pose.sy = 0.85; pose.sx = 1.1; pose.dy = f.h * 0.06; pose.armF = 50; pose.armB = 30; break;
    case 'charge':
      pose.armF = -70; pose.armB = 40; pose.tilt = -0.15; pose.dx = rand(-2, 2); pose.dy = rand(-1, 1); pose.eyes = 'angry';
      if (f.chargeMove === 'usmash') { pose.armF = -40; pose.armB = -40; pose.sy = 0.85; pose.dy = f.h * 0.06; }
      if (f.chargeMove === 'dsmash') { pose.sy = 0.8; pose.dy = f.h * 0.08; pose.armF = 60; pose.armB = -60; }
      break;
    case 'attack': attackPose(f, pose); break;
    case 'hitstun':
      pose.tilt = -0.7 * (f.vx * f.facing > 0 ? -1 : 1) * 0.5 + Math.sin(t * 0.6) * 0.15;
      pose.armF = 150; pose.armB = 120; pose.legF = 60; pose.legB = -50; pose.eyes = 'hurt';
      if (f.tumble) pose.rot = t * 0.35;
      break;
    case 'knockdown': pose.rot = -Math.PI / 2 * f.facing * f.facing; pose.rot = Math.PI / 2; pose.dy = f.h * 0.3; pose.eyes = 'hurt'; pose.armF = 60; pose.armB = 60; break;
    case 'shield': pose.armF = 70; pose.armB = 60; pose.sy = 0.92; pose.dy = f.h * 0.03; pose.legF = 20; pose.legB = -20; break;
    case 'spotdodge': pose.sy = 0.65; pose.sx = 1.15; pose.dy = f.h * 0.15; pose.armF = 90; pose.armB = 90; pose.eyes = 'closed'; break;
    case 'roll': pose.rot = f.st * 0.42 * f.rollDir * f.facing; pose.sx = 0.85; pose.sy = 0.85; pose.armF = 90; pose.armB = 90; pose.legF = 60; pose.legB = 60; break;
    case 'ledge': pose.armF = 170; pose.armB = 165; pose.legF = 10; pose.legB = 20 + Math.sin(t * 0.1) * 8; pose.dy = 0; break;
    case 'shieldbreak': pose.eyes = 'dizzy'; pose.armF = 130; pose.armB = 130; pose.tilt = Math.sin(t * 0.25) * 0.25; break;
  }
  return pose;
}

function attackPose(f, pose) {
  const m = f.move; if (!m) return;
  const p = clamp(f.moveFrame / m.dur, 0, 1);
  const hitS = m.hits.length ? m.hits[0].s / m.dur : 0.3;
  const swing = p < hitS ? easeOut(p / hitS) : 1 - easeOut((p - hitS) / (1 - hitS)) * 0.8;
  pose.eyes = 'angry';
  switch (m.anim) {
    case 'punch': pose.armF = lerp(-40, 110, swing); pose.armB = -30; pose.tilt = 0.12 * swing; pose.legF = 25 * swing; pose.legB = -15; break;
    case 'kick': pose.legF = lerp(-30, 110, swing); pose.legB = -10; pose.armF = 40; pose.armB = -50; pose.tilt = -0.15 * swing; break;
    case 'backkick': pose.legB = lerp(30, -120, swing); pose.legF = 10; pose.armF = 60; pose.armB = 100; pose.tilt = 0.25 * swing; break;
    case 'upper': pose.armF = lerp(30, 185, swing); pose.armB = -30; pose.sy = 1 + 0.1 * swing; pose.legF = 10; pose.legB = -10; pose.tilt = -0.1 * swing; break;
    case 'sweep': pose.sy = 0.72; pose.dy = f.h * 0.14; pose.legF = lerp(20, 100, swing); pose.legB = -30; pose.armF = 80; pose.armB = -20; break;
    case 'dashatk': pose.tilt = 0.45; pose.armF = 100; pose.armB = -60; pose.legF = 70; pose.legB = -70; pose.sx = 1.1; break;
    case 'spin': pose.rot = p * Math.PI * 2 * f.facing; pose.armF = 95; pose.armB = 95; pose.legF = 40; pose.legB = -40; break;
    case 'stomp': pose.legF = lerp(30, 5, swing); pose.legB = lerp(-30, 5, swing); pose.armF = 160; pose.armB = 160; pose.sy = lerp(1, 1.15, swing); break;
    case 'slam': pose.armF = lerp(175, 60, swing); pose.armB = lerp(175, 60, swing); pose.sy = lerp(1.1, 0.85, swing); pose.dy = f.h * 0.06 * swing; break;
    case 'rise': pose.armF = 175; pose.armB = 175; pose.legF = 25; pose.legB = -10; pose.sy = 1.1; pose.sx = 0.92; pose.rot = m.helpless ? f.moveFrame * 0.25 * f.facing : 0; break;
    case 'slide': pose.tilt = 0.5; pose.sy = 0.8; pose.dy = f.h * 0.12; pose.legF = 80; pose.legB = 20; pose.armF = 120; pose.armB = -60; break;
    case 'guard': pose.armF = 80; pose.armB = 80; pose.sy = 0.95; pose.eyes = 'closed'; break;
  }
}

function drawFighter(f, g) {
  const pose = computePose(f);
  ctx.save();
  ctx.translate(f.x + pose.dx, f.y);
  if (f.invisible) { ctx.globalAlpha = 0.15; }
  else if (f.invincible > 0 && f.state !== 'respawn' && Math.floor(g.frame / 3) % 2 === 0) ctx.globalAlpha = 0.5;
  if (f.state === 'respawn') {
    // 復活台
    ctx.save(); ctx.globalAlpha = 0.8; ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath(); ctx.ellipse(0, f.h / 2 + 4, 50, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = f.color; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
  }
  // 影
  if (f.state !== 'respawn') {
    ctx.save(); ctx.globalAlpha *= 0.25; ctx.fillStyle = '#000';
    let sh = null;
    for (const p of g.stage.platforms) if (f.x > p.x && f.x < p.x + p.w && p.y >= f.y + f.h / 2 - 2) if (!sh || p.y < sh.y) sh = p;
    if (sh) { const d = clamp(1 - (sh.y - (f.y + f.h / 2)) / 500, 0.2, 1); ctx.beginPath(); ctx.ellipse(0, sh.y - f.y, f.w * 0.6 * d, 6 * d, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  ctx.translate(0, pose.dy);
  ctx.scale(f.facing, 1);
  ctx.rotate(pose.rot);
  ctx.rotate(pose.tilt);
  ctx.scale(pose.sx, pose.sy);
  drawFighterBody(f, pose, g.frame, false);
  ctx.restore();

  // シールド
  if (f.state === 'shield') {
    const r = 20 + (f.shieldHP / f.def.shieldMax) * 40;
    ctx.save(); ctx.globalAlpha = 0.55; ctx.fillStyle = f.color;
    ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.9; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }
  if (f.counter > 0) {
    ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = '#bfefff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(f.x, f.y, 50 + Math.sin(g.frame * 0.4) * 5, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  if (f.state === 'charge') {
    ctx.save(); ctx.globalAlpha = 0.35 + f.charge / 120; ctx.fillStyle = '#ffd23e';
    ctx.beginPath(); ctx.arc(f.x, f.y, 30 + f.charge * 0.6, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  // 頭上のプレイヤーマーカー
  ctx.save();
  ctx.translate(f.x, f.y - f.h / 2 - 26 + Math.sin(g.frame * 0.1) * 2);
  ctx.fillStyle = f.color;
  ctx.beginPath(); ctx.moveTo(-9, -8); ctx.lineTo(9, -8); ctx.lineTo(0, 4); ctx.closePath(); ctx.fill();
  ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillStyle = '#fff';
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3; ctx.strokeText(PLAYER_NAMES[f.index], 0, -10); ctx.fillText(PLAYER_NAMES[f.index], 0, -10);
  ctx.restore();
}

// 体の描画（ローカル座標、右向き）
function drawFighterBody(f, pose, frame, portrait) {
  const d = f.def, c = d.colors, h = f.h, w = f.w;
  const shoulderY = -h * 0.16, hipY = h * 0.14;
  const armLen = h * 0.3, legLen = h * 0.34;
  const limb = (x0, y0, ang, len, color, width) => {
    const a = ang * DEG;
    const x1 = x0 + Math.sin(a) * len, y1 = y0 + Math.cos(a) * len;
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    return { x: x1, y: y1 };
  };
  const bodyW = w * 0.7, torsoTop = -h * 0.22, torsoBot = h * 0.18;
  // マント（グラシア）
  if (d.flair === 'ice') {
    ctx.fillStyle = '#7fc4ff'; ctx.beginPath();
    ctx.moveTo(-bodyW * 0.45, shoulderY - 4);
    ctx.quadraticCurveTo(-bodyW * 1.3, hipY, -bodyW * 0.8 + Math.sin(frame * 0.15) * 6, torsoBot + legLen * 0.8);
    ctx.lineTo(bodyW * 0.1, torsoBot); ctx.lineTo(bodyW * 0.45, shoulderY - 4); ctx.closePath(); ctx.fill();
  }
  // 後ろ腕・後ろ脚
  limb(-bodyW * 0.3, shoulderY, -pose.armB, armLen, c.dark, w * 0.22);
  const bl = limb(-bodyW * 0.22, hipY, -pose.legB, legLen, c.dark, w * 0.26);
  ctx.fillStyle = c.dark; ctx.beginPath(); ctx.ellipse(bl.x, bl.y, w * 0.2, w * 0.11, 0, 0, Math.PI * 2); ctx.fill();
  // 胴体
  ctx.fillStyle = c.body;
  roundRect(-bodyW / 2, torsoTop, bodyW, torsoBot - torsoTop, w * 0.22); ctx.fill();
  ctx.fillStyle = c.accent;
  roundRect(-bodyW / 2 + 4, torsoTop + 6, bodyW - 8, (torsoBot - torsoTop) * 0.35, 6); ctx.fill();
  // ベルト（プレイヤーカラー）
  ctx.fillStyle = f.color; ctx.fillRect(-bodyW / 2, torsoBot - 8, bodyW, 6);
  if (d.flair === 'rock') {
    ctx.fillStyle = '#8f6a3a'; ctx.beginPath(); ctx.arc(-bodyW * 0.45, shoulderY - 2, w * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(bodyW * 0.45, shoulderY - 2, w * 0.2, 0, Math.PI * 2); ctx.fill();
  }
  // 前脚
  const fl = limb(bodyW * 0.22, hipY, pose.legF, legLen, c.body, w * 0.26);
  ctx.fillStyle = c.dark; ctx.beginPath(); ctx.ellipse(fl.x, fl.y, w * 0.2, w * 0.11, 0, 0, Math.PI * 2); ctx.fill();
  // 前腕
  const fa = limb(bodyW * 0.3, shoulderY, pose.armF, armLen, c.body, w * 0.22);
  ctx.fillStyle = c.skin; ctx.beginPath(); ctx.arc(fa.x, fa.y, w * 0.14, 0, Math.PI * 2); ctx.fill();
  // 頭
  const headR = h * 0.19, headY = -h * 0.36;
  ctx.fillStyle = c.skin; ctx.beginPath(); ctx.arc(0, headY, headR, 0, Math.PI * 2); ctx.fill();
  // 髪・装飾
  if (d.flair === 'flame') {
    for (let i = 0; i < 4; i++) {
      const fx = -headR * 0.8 + i * headR * 0.55, fh = headR * (1 + Math.abs(Math.sin(frame * 0.3 + i)) * 0.6);
      ctx.fillStyle = i % 2 ? c.hair : c.accent;
      ctx.beginPath(); ctx.moveTo(fx - headR * 0.3, headY - headR * 0.5); ctx.lineTo(fx, headY - headR * 0.5 - fh); ctx.lineTo(fx + headR * 0.3, headY - headR * 0.5); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = c.body; ctx.beginPath(); ctx.arc(0, headY, headR, Math.PI, Math.PI * 2); ctx.fill();
  } else if (d.flair === 'ice') {
    ctx.fillStyle = c.hair; ctx.beginPath(); ctx.arc(0, headY, headR * 1.02, Math.PI * 0.95, Math.PI * 2.05); ctx.fill();
    ctx.fillStyle = '#bfefff';
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * headR * 0.55 - 5, headY - headR * 0.85); ctx.lineTo(i * headR * 0.55, headY - headR * 1.6 - (i === 0 ? 8 : 0)); ctx.lineTo(i * headR * 0.55 + 5, headY - headR * 0.85); ctx.closePath(); ctx.fill(); }
  } else if (d.flair === 'bolt') {
    ctx.fillStyle = c.hair;
    ctx.beginPath(); ctx.moveTo(-headR, headY - headR * 0.2); ctx.lineTo(-headR * 0.6, headY - headR * 1.5); ctx.lineTo(-headR * 0.2, headY - headR * 0.9); ctx.lineTo(headR * 0.2, headY - headR * 1.7); ctx.lineTo(headR * 0.5, headY - headR * 0.9); ctx.lineTo(headR * 1.1, headY - headR * 1.3); ctx.lineTo(headR, headY - headR * 0.1); ctx.closePath(); ctx.fill();
  } else if (d.flair === 'rock') {
    ctx.fillStyle = c.hair; ctx.beginPath(); ctx.arc(0, headY, headR, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
    ctx.fillStyle = '#e8e0c8';
    ctx.beginPath(); ctx.moveTo(-headR * 0.9, headY - headR * 0.3); ctx.lineTo(-headR * 1.5, headY - headR * 1.2); ctx.lineTo(-headR * 0.5, headY - headR * 0.8); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(headR * 0.9, headY - headR * 0.3); ctx.lineTo(headR * 1.5, headY - headR * 1.2); ctx.lineTo(headR * 0.5, headY - headR * 0.8); ctx.closePath(); ctx.fill();
  }
  // 顔
  const ex = headR * 0.35, ey = headY - headR * 0.05;
  ctx.fillStyle = '#222'; ctx.strokeStyle = '#222'; ctx.lineWidth = 2.5;
  const eye = (x) => {
    switch (pose.eyes) {
      case 'hurt': ctx.beginPath(); ctx.moveTo(x - 4, ey - 4); ctx.lineTo(x + 4, ey + 4); ctx.moveTo(x + 4, ey - 4); ctx.lineTo(x - 4, ey + 4); ctx.stroke(); break;
      case 'closed': ctx.beginPath(); ctx.moveTo(x - 4, ey); ctx.lineTo(x + 4, ey); ctx.stroke(); break;
      case 'dizzy': ctx.beginPath(); ctx.arc(x, ey, 4, 0, Math.PI * 1.5); ctx.stroke(); break;
      case 'angry': ctx.beginPath(); ctx.arc(x, ey + 1, 3.2, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(x - 5, ey - 6); ctx.lineTo(x + 5, ey - 3); ctx.stroke(); break;
      default: ctx.beginPath(); ctx.arc(x, ey, 3.2, 0, Math.PI * 2); ctx.fill();
    }
  };
  eye(ex); eye(ex + headR * 0.55);
  if (!portrait && (pose.eyes === 'angry' || pose.eyes === 'hurt')) { ctx.beginPath(); ctx.moveTo(ex - 2, ey + headR * 0.45); ctx.lineTo(ex + headR * 0.6, ey + headR * 0.45); ctx.stroke(); }
}

function drawProjectile(p, frame) {
  ctx.save(); ctx.translate(p.x, p.y);
  ctx.globalAlpha = 0.4; ctx.fillStyle = p.glow; ctx.beginPath(); ctx.arc(0, 0, p.r * 1.6, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1; ctx.fillStyle = p.color;
  if (p.type === 'rock') { ctx.rotate(frame * 0.15); ctx.beginPath(); for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2, r = p.r * (0.8 + (i % 2) * 0.25); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill(); }
  else if (p.type === 'ice') { ctx.rotate(frame * 0.2); ctx.beginPath(); ctx.moveTo(p.r * 1.3, 0); ctx.lineTo(0, p.r * 0.7); ctx.lineTo(-p.r * 1.3, 0); ctx.lineTo(0, -p.r * 0.7); ctx.closePath(); ctx.fill(); }
  else if (p.type === 'spark') { ctx.beginPath(); ctx.moveTo(-p.r * 2 * Math.sign(p.vx), 0); ctx.lineTo(0, -p.r); ctx.lineTo(p.r * 1.5 * Math.sign(p.vx), 0); ctx.lineTo(0, p.r); ctx.closePath(); ctx.fill(); }
  else { ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = p.glow; ctx.beginPath(); ctx.arc(-p.vx * 0.3, 0, p.r * 0.5, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

function drawEffect(e) {
  const p = e.t / e.life;
  ctx.save(); ctx.translate(e.x, e.y);
  switch (e.type) {
    case 'spark': {
      ctx.globalAlpha = 1 - p;
      ctx.strokeStyle = e.color; ctx.lineWidth = 4; ctx.fillStyle = '#fff';
      const r = e.size * (0.5 + easeOut(p));
      ctx.beginPath(); ctx.arc(0, 0, r * 0.4 * (1 - p), 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + e.t * 0.1; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.4, Math.sin(a) * r * 0.4); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); ctx.stroke(); }
      break;
    }
    case 'dust':
      ctx.globalAlpha = (1 - p) * 0.7; ctx.fillStyle = e.color || 'rgba(200,190,170,0.9)';
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(i * 14 * (0.5 + p), -p * 12, 6 + p * 8, 0, Math.PI * 2); ctx.fill(); }
      break;
    case 'ring':
      ctx.globalAlpha = 1 - p; ctx.strokeStyle = e.color; ctx.lineWidth = 6 * (1 - p) + 1;
      ctx.beginPath(); ctx.arc(0, 0, e.size * easeOut(p) + 5, 0, Math.PI * 2); ctx.stroke();
      break;
    case 'ko': {
      ctx.globalAlpha = 1 - p * 0.8;
      const r = 40 + easeOut(p) * 160;
      ctx.fillStyle = e.color; ctx.beginPath();
      for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, rr = i % 2 ? r : r * 0.45; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, r * 0.3 * (1 - p), 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'kotext':
      ctx.globalAlpha = 1 - p; ctx.translate(0, -p * 30);
      ctx.font = 'bold 28px "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 6; ctx.strokeStyle = '#000'; ctx.strokeText(e.text, 0, 0); ctx.fillStyle = e.color; ctx.fillText(e.text, 0, 0);
      break;
  }
  ctx.restore();
}

function drawHitboxes(g) {
  for (const f of g.fighters) {
    if (f.dead) continue;
    ctx.strokeStyle = f.isInvulnerable() ? '#0f0' : '#ff0'; ctx.lineWidth = 2; ctx.strokeRect(f.rect.x, f.rect.y, f.w, f.h);
    if (f.state === 'attack' && f.move) {
      const fr = f.moveFrame - 1;
      for (const hb of f.move.hits) if (fr >= hb.s && fr <= hb.e) {
        ctx.fillStyle = 'rgba(255,0,0,0.4)'; ctx.beginPath(); ctx.arc(f.x + hb.x * f.facing, f.y + hb.y, hb.r, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  for (const p of g.projectiles) { ctx.fillStyle = 'rgba(255,0,0,0.4)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
}

/* ---------------------------------------------------------------------
   シーン：タイトル / キャラ選択 / ステージ選択 / 結果
--------------------------------------------------------------------- */
const settings = {
  players: [{ char: 0, cpu: false, level: 5 }, { char: 1, cpu: true, level: 5 }],
  stage: 0, stocks: 3, time: 3,
};

function drawTitleBackdrop(frame) {
  drawBackground('space', frame);
}
function centerText(text, x, y, size, color = '#fff', stroke = 6, font = '"Arial Black", sans-serif') {
  ctx.font = 'bold ' + size + 'px ' + font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (stroke) { ctx.lineWidth = stroke; ctx.strokeStyle = '#000'; ctx.strokeText(text, x, y); }
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}

class TitleScene {
  constructor() { this.t = 0; this.demo = this.makeDemo(); }
  makeDemo() {
    return CHARACTERS.map((c, i) => {
      const f = new Fighter(c, i, { stocks: 1 });
      f.x = 250 + i * 260; f.y = 560; f.facing = i < 2 ? 1 : -1; f.state = 'idle';
      return f;
    });
  }
  update() {
    this.t++;
    for (const f of this.demo) { f.anim++; if (this.t % 90 === f.index * 20) { f.state = f.state === 'idle' ? 'run' : 'idle'; } }
    if (keyPressed('Enter') || keyPressed('KeyJ') || keyPressed('Space') || keyPressed('Comma')) { Sound.play('select'); scene = new SelectScene(); }
    const pad = readGamepad(0); if (pad && (pad.attack || pad.jump)) { if (!this.padHeld) { Sound.play('select'); scene = new SelectScene(); } this.padHeld = true; } else this.padHeld = false;
  }
  draw() {
    drawTitleBackdrop(this.t);
    ctx.fillStyle = '#3a3a55'; ctx.fillRect(140, 600, 1000, 80); ctx.fillStyle = '#9ad7ff'; ctx.fillRect(140, 600, 1000, 6);
    for (const f of this.demo) drawFighter(f, { frame: this.t, stage: { platforms: [{ x: 140, y: 600, w: 1000, h: 80 }] } });
    ctx.save(); ctx.translate(W / 2, 200); ctx.rotate(-0.04);
    const s = 1 + Math.sin(this.t * 0.05) * 0.02; ctx.scale(s, s);
    centerText('BRAWL ARENA', 0, 0, 120, '#ffd23e', 14);
    ctx.restore();
    centerText('大乱闘バトルアリーナ', W / 2, 300, 44, '#fff', 8, 'sans-serif');
    if (Math.floor(this.t / 30) % 2 === 0) centerText('PRESS ENTER / J / ゲームパッドのボタン', W / 2, 400, 26, '#fff', 4, 'sans-serif');
    centerText('4人のオリジナルファイター・3ステージ・2人対戦 / CPU対戦', W / 2, 460, 20, '#ccd', 3, 'sans-serif');
    ctx.font = '14px sans-serif'; ctx.fillStyle = '#889'; ctx.textAlign = 'center'; ctx.fillText('© BRAWL ARENA — オリジナル作品', W / 2, 700);
  }
}

class SelectScene {
  constructor() {
    this.cursor = [settings.players[0].char, settings.players[1].char];
    this.confirmed = [false, false];
    this.t = 0;
    this.phase = 'char'; // char → stage
    this.stageCursor = settings.stage;
  }
  update() {
    this.t++;
    const p = settings.players;
    if (this.phase === 'char') {
      if (keyPressed('Tab')) { p[1].cpu = !p[1].cpu; this.confirmed[1] = false; Sound.play('move'); }
      for (let i = 1; i <= 9; i++) if (keyPressed('Digit' + i)) { p[1].level = i; Sound.play('move'); }
      if (keyPressed('BracketLeft')) { settings.stocks = Math.max(1, settings.stocks - 1); Sound.play('move'); }
      if (keyPressed('BracketRight')) { settings.stocks = Math.min(5, settings.stocks + 1); Sound.play('move'); }
      if (keyPressed('Minus')) { settings.time = Math.max(0, settings.time - 1); Sound.play('move'); }
      if (keyPressed('Equal')) { settings.time = Math.min(9, settings.time + 1); Sound.play('move'); }
      if (keyPressed('Escape')) { Sound.play('back'); scene = new TitleScene(); return; }

      const inputs = [getPlayerInput(0), getPlayerInput(1)];
      const p1WasConfirmed = this.confirmed[0];
      for (let i = 0; i < 2; i++) {
        let inp = inputs[i];
        // CPU側は1Pが2Pのキャラも選ぶ（1P確定後、同じフレームの入力は使わない）
        if (i === 1 && p[1].cpu) { if (!p1WasConfirmed) continue; inp = inputs[0]; }
        if (this.confirmed[i]) {
          if (inp.specialP || inp.shieldP) { this.confirmed[i] = false; Sound.play('back'); if (i === 0 && p[1].cpu) this.confirmed[1] = false; }
          continue;
        }
        if (inp.leftP) { this.cursor[i] = (this.cursor[i] + CHARACTERS.length - 1) % CHARACTERS.length; Sound.play('move'); }
        if (inp.rightP) { this.cursor[i] = (this.cursor[i] + 1) % CHARACTERS.length; Sound.play('move'); }
        if (inp.attackP || inp.jumpP && !inp.up) { this.confirmed[i] = true; p[i].char = this.cursor[i]; Sound.play('select'); }
      }
      if (keyPressed('KeyR')) { const i = this.confirmed[0] ? 1 : 0; this.cursor[i] = randi(0, CHARACTERS.length - 1); Sound.play('move'); }
      if (this.confirmed[0] && this.confirmed[1]) { this.phase = 'stage'; this.stageT = 0; Sound.play('select'); }
    } else {
      this.stageT = (this.stageT || 0) + 1;
      const inp = getPlayerInput(0), inp2 = getPlayerInput(1);
      if (this.stageT < 10) return;
      if (inp.leftP || inp2.leftP || keyPressed('ArrowLeft')) { this.stageCursor = (this.stageCursor + STAGES.length - 1) % STAGES.length; Sound.play('move'); }
      if (inp.rightP || inp2.rightP) { this.stageCursor = (this.stageCursor + 1) % STAGES.length; Sound.play('move'); }
      if (inp.attackP || inp2.attackP || keyPressed('Enter')) {
        settings.stage = this.stageCursor; Sound.play('go');
        scene = new MatchScene();
      }
      if (inp.specialP || inp.shieldP || keyPressed('Escape')) { this.phase = 'char'; this.confirmed = [false, false]; Sound.play('back'); }
    }
  }
  draw() {
    drawBackground('city', this.t);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, H);
    if (this.phase === 'char') this.drawChar(); else this.drawStage();
  }
  drawChar() {
    centerText('ファイターを選べ！', W / 2, 60, 46, '#ffd23e', 8, 'sans-serif');
    const n = CHARACTERS.length, bw = 220, gap = 30, x0 = (W - (n * bw + (n - 1) * gap)) / 2, y0 = 120;
    CHARACTERS.forEach((c, i) => {
      const x = x0 + i * (bw + gap);
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; roundRect(x, y0, bw, 300, 14); ctx.fill();
      const g = ctx.createLinearGradient(0, y0, 0, y0 + 300); g.addColorStop(0, c.colors.body); g.addColorStop(1, c.colors.dark);
      ctx.globalAlpha = 0.5; ctx.fillStyle = g; roundRect(x, y0, bw, 300, 14); ctx.fill(); ctx.globalAlpha = 1;
      // キャラ描画
      const f = new Fighter(c, i, { stocks: 1 }); f.anim = this.t; f.state = 'idle';
      const hovered = this.cursor.some((cu, pi) => cu === i && (pi === 0 || !settings.players[1].cpu || this.confirmed[0]));
      ctx.save(); ctx.translate(x + bw / 2, y0 + 170); ctx.scale(1.6, 1.6);
      if (hovered) f.state = 'run';
      drawFighterBody(f, computePose(f), this.t, false);
      ctx.restore();
      centerText(c.en, x + bw / 2, y0 + 250, 26, '#fff', 5);
      centerText(c.name, x + bw / 2, y0 + 280, 18, '#eee', 3, 'sans-serif');
      // カーソル
      this.cursor.forEach((cu, pi) => {
        if (cu !== i) return;
        if (pi === 1 && settings.players[1].cpu && !this.confirmed[0]) return;
        ctx.strokeStyle = PLAYER_COLORS[pi]; ctx.lineWidth = this.confirmed[pi] ? 8 : 5;
        const off = pi * 6;
        roundRect(x - off, y0 - off, bw + off * 2, 300 + off * 2, 14 + off); ctx.stroke();
        ctx.fillStyle = PLAYER_COLORS[pi];
        roundRect(x + 10 + pi * 70, y0 + 8, 60, 26, 6); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText((pi === 1 && settings.players[1].cpu ? 'CPU' : PLAYER_NAMES[pi]) + (this.confirmed[pi] ? ' OK' : ''), x + 40 + pi * 70, y0 + 21);
      });
    });
    // 説明
    const c0 = CHARACTERS[this.cursor[0]], c1 = CHARACTERS[this.cursor[1]];
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = '18px sans-serif';
    ctx.fillStyle = PLAYER_COLORS[0]; ctx.fillText('1P: ' + c0.name + ' — ' + c0.desc, 80, 460);
    ctx.fillStyle = PLAYER_COLORS[1]; ctx.fillText((settings.players[1].cpu ? 'CPU' : '2P') + ': ' + c1.name + ' — ' + c1.desc, 80, 490);
    // ルール
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; roundRect(60, 530, W - 120, 150, 12); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif';
    ctx.fillText('ルール　ストック: ' + settings.stocks + ' ( [ ] で変更)　　制限時間: ' + (settings.time ? settings.time + '分' : '∞') + ' ( - = で変更)　　2P: ' + (settings.players[1].cpu ? 'CPU Lv' + settings.players[1].level + ' (1〜9 でレベル変更)' : '人間') + ' (Tab で切替)', 80, 560);
    ctx.font = '16px sans-serif'; ctx.fillStyle = '#ccd';
    ctx.fillText('1P: A/D で選択、J で決定、K でキャンセル　　2P: ←/→ で選択、, で決定、. でキャンセル　　R: ランダム　　Esc: タイトルへ', 80, 600);
    ctx.fillText('操作: 移動 / ジャンプ(2段) / 攻撃(方向+攻撃で弱・強、方向を同時押しでスマッシュ・長押しでため) / 必殺技(方向で4種) / シールド(方向で回避・空中で緊急回避)', 80, 630);
    ctx.fillText('地上で下を押しながら攻撃 = 下強、走りながら攻撃 = ダッシュ攻撃、崖につかまれます。ダメージ％が高いほど遠くへ吹っ飛びます。', 80, 656);
  }
  drawStage() {
    centerText('ステージを選べ！', W / 2, 60, 46, '#ffd23e', 8, 'sans-serif');
    const n = STAGES.length, bw = 340, bh = 200, gap = 40, x0 = (W - (n * bw + (n - 1) * gap)) / 2, y0 = 150;
    STAGES.forEach((s, i) => {
      const x = x0 + i * (bw + gap);
      ctx.save(); roundRect(x, y0, bw, bh, 12); ctx.clip();
      ctx.translate(x, y0); ctx.scale(bw / W, bh / H);
      drawBackground(s.theme, this.t); drawPlatforms(s);
      ctx.restore();
      ctx.strokeStyle = i === this.stageCursor ? '#ffd23e' : 'rgba(255,255,255,0.3)'; ctx.lineWidth = i === this.stageCursor ? 8 : 3;
      roundRect(x, y0, bw, bh, 12); ctx.stroke();
      centerText(s.name, x + bw / 2, y0 + bh + 30, 22, '#fff', 4, 'sans-serif');
    });
    const s = STAGES[this.stageCursor];
    centerText(s.desc, W / 2, 440, 22, '#ccd', 3, 'sans-serif');
    // 対戦カード
    const p = settings.players;
    const cA = CHARACTERS[p[0].char], cB = CHARACTERS[p[1].char];
    centerText(cA.name + '  VS  ' + cB.name, W / 2, 520, 40, '#fff', 8, 'sans-serif');
    centerText('ストック ' + settings.stocks + '　/　制限時間 ' + (settings.time ? settings.time + '分' : 'なし'), W / 2, 570, 20, '#ccd', 3, 'sans-serif');
    if (Math.floor(this.t / 30) % 2 === 0) centerText('← → で選択　　J / Enter で開始　　K で戻る', W / 2, 640, 22, '#ffd23e', 4, 'sans-serif');
  }
}

class MatchScene {
  constructor() { this.game = new Game(settings); }
  update() {
    const g = this.game;
    if (keyPressed('Escape') || keyPressed('KeyP')) { if (g.phase === 'play') { g.paused = !g.paused; Sound.play('move'); } }
    if (keyPressed('F1')) g.hitboxDebug = !g.hitboxDebug;
    if (g.paused && keyPressed('KeyQ')) { scene = new SelectScene(); return; }
    // ゲームパッドのスタートボタン
    const pad = readGamepad(0);
    const gps = navigator.getGamepads ? navigator.getGamepads() : [];
    const startPressed = [0, 1].some(i => gps[i] && gps[i].buttons[9] && gps[i].buttons[9].pressed);
    if (startPressed && !this.startHeld && g.phase === 'play') { g.paused = !g.paused; }
    this.startHeld = startPressed;
    g.update();
  }
  draw() { this.game.draw(); }
}

class ResultScene {
  constructor(game) { this.game = game; this.t = 0; }
  update() {
    this.t++;
    if (this.t < 30) return;
    const inp0 = getPlayerInput(0), inp1 = getPlayerInput(1);
    if (keyPressed('Enter') || inp0.attackP || inp1.attackP) { Sound.play('select'); scene = new SelectScene(); }
    if (keyPressed('KeyR') || inp0.specialP) { Sound.play('go'); scene = new MatchScene(); }
  }
  draw() {
    const g = this.game;
    drawBackground(g.stage.theme, this.t);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
    const w = g.winner;
    const p = Math.min(1, this.t / 20);
    ctx.save(); ctx.translate(W / 2, 110); ctx.scale(2 - easeOut(p), 2 - easeOut(p));
    centerText(w ? w.def.name + ' の勝利！' : '引き分け', 0, 0, 64, '#ffd23e', 10, 'sans-serif');
    ctx.restore();
    if (w) {
      centerText(PLAYER_NAMES[w.index] + (w.cpu ? ' (CPU)' : ''), W / 2, 170, 26, w.color, 5, 'sans-serif');
      const f = w; const save = f.state; f.state = 'idle'; f.anim = this.t;
      ctx.save(); ctx.translate(W / 2, 330); ctx.scale(2.2, 2.2);
      const pose = computePose(f); pose.armF = 170 + Math.sin(this.t * 0.2) * 10; pose.armB = -30;
      drawFighterBody(f, pose, this.t, false);
      ctx.restore(); f.state = save;
    }
    // 順位表
    const ranked = g.ranked || g.fighters;
    const y0 = 460;
    ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ranked.forEach((f, i) => {
      const y = y0 + i * 50;
      ctx.fillStyle = 'rgba(255,255,255,' + (i === 0 ? 0.18 : 0.08) + ')'; roundRect(240, y - 20, 800, 42, 8); ctx.fill();
      ctx.fillStyle = f.color; ctx.fillText((i + 1) + '位  ' + PLAYER_NAMES[f.index] + (f.cpu ? '(CPU)' : '') + '  ' + f.def.name, 260, y);
      ctx.fillStyle = '#fff';
      ctx.fillText('KO: ' + f.kos + '　落下: ' + f.falls + '　与ダメージ: ' + Math.round(f.damageDealt) + '%　残りストック: ' + Math.max(0, f.stocks), 580, y);
    });
    if (Math.floor(this.t / 30) % 2 === 0 && this.t > 30) centerText('Enter / J : キャラ選択へ　　R / K : 再戦', W / 2, 660, 24, '#ffd23e', 4, 'sans-serif');
  }
}

/* ---------------------------------------------------------------------
   メインループ（固定 60fps）
--------------------------------------------------------------------- */
let scene = new TitleScene();
let last = performance.now(), acc = 0;
const STEP = 1000 / 60;
function loop(now) {
  acc += Math.min(100, now - last); last = now;
  let steps = 0;
  while (acc >= STEP && steps < 4) {
    scene.update();
    prevKeys = Object.assign({}, keys);
    for (const k in tapped) tapped[k] = false;
    acc -= STEP; steps++;
  }
  if (steps === 4) acc = 0;
  scene.draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
