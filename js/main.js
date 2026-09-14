/* 画面とゲームの結線 / Wiring: engine + renderer + input + HUD. */
(function (global) {
  'use strict';

  var REROLL_COST = 15;
  var STORE_KEY = 'uspeak.tetris.v1';

  var $ = function (id) { return document.getElementById(id); };

  // ---- 保存データ -------------------------------------------------------
  var store = {
    wallet: 0,
    best: { classic: 0, word: 0 },
    bestWord: null,
    settings: { das: 150, arr: 33, startLevel: 1, ghost: true, sound: true }
  };

  function loadStore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        store.wallet = data.wallet || 0;
        store.best = Object.assign(store.best, data.best || {});
        store.bestWord = data.bestWord || null;
        store.settings = Object.assign(store.settings, data.settings || {});
      }
    } catch (e) { /* localStorage が使えない環境では既定値のまま */ }
  }

  function saveStore() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) {}
  }

  loadStore();

  // ---- 生成 -------------------------------------------------------------
  var mode = 'classic';
  var engine = new global.TetrisEngine({ mode: mode, startLevel: store.settings.startLevel, onEvent: onEngineEvent });
  var renderer = new global.Renderer($('board'), $('hold'), $('next'));
  renderer.showGhost = store.settings.ghost;
  renderer.showLetters = true;   // 文字を持つのは WORD モードのミノだけ
  global.Sfx.enabled = store.settings.sound;

  var input = new global.Input({
    das: store.settings.das,
    arr: store.settings.arr,
    actions: {
      move: function (dir) { return engine.move(dir); },
      rotate: function (dir) { return engine.rotate(dir); },
      softDropChange: function (on) { engine.softDropping = on; },
      hardDrop: function () { engine.hardDrop(); },
      hold: function () { engine.holdPiece(); },
      reroll: function () { doReroll(); },
      pause: function () { togglePause(); },
      confirm: function () { onConfirm(); },
      mute: function () { toggleSound(); }
    }
  });
  input.bindTouch($('touch'));

  var running = false;
  var paused = false;
  var lastCoins = 0;
  var lastTime = 0;

  // ---- エンジンからのイベント -------------------------------------------
  function onEngineEvent(type, data) {
    switch (type) {
      case 'move': global.Sfx.move(); break;
      case 'rotate': global.Sfx.rotate(); break;
      case 'hold': global.Sfx.hold(); break;
      case 'harddrop':
        global.Sfx.drop();
        renderer.kick(Math.min(3 + data.distance * 0.4, 9));
        break;
      case 'lock': global.Sfx.lock(); break;
      case 'reroll': global.Sfx.coin(); break;
      case 'wordscored': onWordScored(data); break;
      case 'linescored': onLineScored(data); break;
      case 'gameover': onGameOver(data); break;
    }
  }

  function onWordScored(data) {
    var longest = data.words.reduce(function (a, b) { return b.length > a.length ? b : a; });
    global.Sfx.word(longest.length, data.chain);
    global.Sfx.coin();
    renderer.kick(2 + longest.length);

    data.words.forEach(function (w) {
      var label = w.word.toUpperCase() + '  ◉' + w.coins;
      var sub = (w.meaning ? w.meaning + ' ・ ' : '') + w.length + '文字 ×' +
        global.Words.lengthMultiplier(w.length);
      toast(label, sub, w.length >= 6 ? 'is-chain' : '');
    });
    if (data.chain > 1) toast('CHAIN ×' + data.chain, '連鎖ボーナス ×' + global.Words.chainMultiplier(data.chain), 'is-chain');
    renderWordLog();
  }

  function onLineScored(data) {
    if (data.lines > 0) {
      global.Sfx.lines(data.lines);
      renderer.kick(data.lines * 2);
      var sub = [];
      if (data.b2b) sub.push('BACK-TO-BACK');
      if (data.combo > 0) sub.push(data.combo + ' COMBO');
      if (data.perfect) sub.push('PERFECT CLEAR');
      toast(data.label + '  +' + data.score, sub.join(' ・ '), 'is-line');
    }
    if (data.leveled) {
      global.Sfx.level();
      toast('LEVEL ' + data.level, 'スピードアップ', 'is-line');
    }
  }

  function onGameOver(data) {
    running = false;
    input.enabled = false;
    global.Sfx.over();

    if (data.score > (store.best[mode] || 0)) store.best[mode] = data.score;
    if (data.bestWord) {
      if (!store.bestWord || data.bestWord.word.length > store.bestWord.word.length) {
        store.bestWord = { word: data.bestWord.word, coins: data.bestWord.coins };
      }
    }
    saveStore();

    var rows = '' +
      row('SCORE', data.score.toLocaleString()) +
      row('LINES', data.lines) +
      row('LEVEL', data.level) +
      row('TIME', formatTime(data.elapsed));
    if (mode === 'word') {
      rows += row('WORDS', data.words + ' 語') +
        row('COINS', '◉ ' + data.coins.toLocaleString()) +
        row('LONGEST', data.bestWord ? data.bestWord.word.toUpperCase() : '—');
    }

    showOverlay(
      '<h3>GAME OVER</h3>' +
      (mode === 'word'
        ? '<p>この試合で貯めた U-Speak コイン</p><div class="big">◉ ' + data.coins.toLocaleString() + '</div>'
        : '<p>' + (data.reason === 'lock out' ? 'ロックアウト' : 'ブロックアウト') + '</p>') +
      '<div class="result">' + rows + '</div>' +
      '<p>累計コイン ◉ ' + store.wallet.toLocaleString() + ' ／ ハイスコア ' + (store.best[mode] || 0).toLocaleString() + '</p>' +
      '<p><kbd>Enter</kbd> でもう一度</p>'
    );
  }

  function row(label, value) {
    return '<div><span>' + label + '</span><b>' + value + '</b></div>';
  }

  // ---- トースト ---------------------------------------------------------
  function toast(text, sub, cls) {
    var el = document.createElement('div');
    el.className = 'toast ' + (cls || '');
    el.innerHTML = text + (sub ? '<small>' + sub + '</small>' : '');
    $('toasts').appendChild(el);
    setTimeout(function () { el.remove(); }, 1500);
  }

  // ---- オーバーレイ -----------------------------------------------------
  function showOverlay(html) {
    var el = $('overlay');
    el.innerHTML = '<div>' + html + '</div>';
    el.classList.add('is-open');
  }
  function hideOverlay() { $('overlay').classList.remove('is-open'); }

  function titleOverlay() {
    if (mode === 'word') {
      showOverlay(
        '<h3>WORD MODE</h3>' +
        '<p>アルファベット付きのミノを積んで、<br>タテ・ヨコに <b>3文字以上の英単語</b> を作ると消えます。</p>' +
        '<p>長い単語ほど倍率が大きい（3文字 ×1 → 8文字 ×20）。<br>消えたあとは落下して <b>連鎖</b> します。</p>' +
        '<p>そろった行はテトリスと同じようにライン消去。</p>' +
        '<p>辞書 ' + global.Words.size().toLocaleString() + ' 語 ／ ハイスコア ' + (store.best.word || 0).toLocaleString() + '</p>' +
        '<p><kbd>Enter</kbd> またはクリックで開始</p>'
      );
    } else {
      showOverlay(
        '<h3>CLASSIC MODE</h3>' +
        '<p>ガイドライン準拠のテトリス。<br>SRS回転・7-bag・ホールド・ゴースト・<br>ロックディレイ・T-Spin・B2B・コンボ対応。</p>' +
        '<p>ハイスコア ' + (store.best.classic || 0).toLocaleString() + '</p>' +
        '<p><kbd>Enter</kbd> またはクリックで開始</p>'
      );
    }
  }

  function onConfirm() {
    if (!running) startGame();
    else if (paused) togglePause();
  }

  $('overlay').addEventListener('click', function () { onConfirm(); });

  // ---- ゲーム進行 -------------------------------------------------------
  function startGame() {
    engine.startLevel = store.settings.startLevel;
    engine.reset(mode, store.settings.startLevel);
    engine.start();
    renderer.resize(engine);
    lastCoins = 0;
    running = true;
    paused = false;
    input.enabled = true;
    hideOverlay();
    renderWordLog();
    global.Sfx.ensure();
  }

  function togglePause() {
    if (!running) return;
    paused = !paused;
    input.enabled = !paused;
    if (paused) {
      showOverlay('<h3>PAUSED</h3><p><kbd>P</kbd> / <kbd>Esc</kbd> / クリックで再開</p>');
    } else {
      hideOverlay();
    }
  }

  function doReroll() {
    if (mode !== 'word' || !running || paused) return;
    if (engine.phase !== 'falling') return;
    if (engine.coins < REROLL_COST) { toast('コインが足りません', '◉ ' + REROLL_COST + ' 必要', 'is-chain'); return; }
    if (engine.rerollLetters()) engine.coins -= REROLL_COST;
  }

  function setMode(next) {
    if (mode === next) return;
    mode = next;
    document.body.setAttribute('data-mode', mode);
    Array.prototype.forEach.call(document.querySelectorAll('.mode-btn'), function (btn) {
      var on = btn.getAttribute('data-mode') === mode;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    running = false;
    paused = false;
    input.enabled = false;
    engine.reset(mode, store.settings.startLevel);
    renderer.resize(engine);
    renderWordLog();
    titleOverlay();
  }

  Array.prototype.forEach.call(document.querySelectorAll('.mode-btn'), function (btn) {
    btn.addEventListener('click', function () { setMode(btn.getAttribute('data-mode')); });
  });

  // ---- HUD --------------------------------------------------------------
  function formatTime(ms) {
    var total = Math.floor(ms / 1000);
    var m = Math.floor(total / 60);
    var s = total % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function renderWordLog() {
    var ul = $('word-log');
    if (!ul) return;
    ul.innerHTML = engine.wordLog.map(function (w) {
      return '<li><span class="w">' + w.word + '</span><span class="c">◉' + w.coins + '</span>' +
        (w.meaning ? '<span class="m">' + w.meaning + '</span>' : '') + '</li>';
    }).join('');
    var best = $('best-word');
    var label = engine.bestWord ? engine.bestWord.word : (store.bestWord ? store.bestWord.word : null);
    best.querySelector('b').textContent = label ? label : '—';
  }

  function updateHud() {
    var s = engine.stats();
    $('stat-score').textContent = s.score.toLocaleString();
    $('stat-level').textContent = s.level;
    $('stat-lines').textContent = s.lines;
    $('stat-time').textContent = formatTime(s.elapsed);
    $('stat-best').textContent = (store.best[mode] || 0).toLocaleString();
    $('run-coins').textContent = s.coins.toLocaleString();
    $('run-words').textContent = s.words;
    $('wallet-total').textContent = store.wallet.toLocaleString();

    var btn = $('btn-reroll');
    btn.disabled = !(running && !paused && mode === 'word' && engine.phase === 'falling' && s.coins >= REROLL_COST);
  }

  $('btn-reroll').addEventListener('click', doReroll);

  // ---- 設定 -------------------------------------------------------------
  function toggleSound() {
    store.settings.sound = !store.settings.sound;
    global.Sfx.enabled = store.settings.sound;
    $('btn-sound').classList.toggle('is-off', !store.settings.sound);
    saveStore();
  }
  $('btn-sound').addEventListener('click', toggleSound);
  $('btn-sound').classList.toggle('is-off', !store.settings.sound);

  $('btn-settings').addEventListener('click', function () { $('settings').hidden = false; });
  $('settings-close').addEventListener('click', function () { $('settings').hidden = true; saveStore(); });
  $('settings').addEventListener('click', function (e) {
    if (e.target === $('settings')) { $('settings').hidden = true; saveStore(); }
  });

  function bindRange(id, valueId, apply) {
    var el = $(id);
    el.value = apply.get();
    $(valueId).textContent = el.value;
    el.addEventListener('input', function () {
      $(valueId).textContent = el.value;
      apply.set(parseInt(el.value, 10));
    });
  }
  bindRange('das', 'das-value', {
    get: function () { return store.settings.das; },
    set: function (v) { store.settings.das = v; input.das = v; }
  });
  bindRange('arr', 'arr-value', {
    get: function () { return store.settings.arr; },
    set: function (v) { store.settings.arr = v; input.arr = v; }
  });
  bindRange('start-level', 'level-value', {
    get: function () { return store.settings.startLevel; },
    set: function (v) { store.settings.startLevel = v; }
  });
  $('ghost').checked = store.settings.ghost;
  $('ghost').addEventListener('change', function () {
    store.settings.ghost = $('ghost').checked;
    renderer.showGhost = store.settings.ghost;
    saveStore();
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && running && !paused) togglePause();
  });

  // ---- ループ -----------------------------------------------------------
  function frame(now) {
    var dt = Math.min(now - lastTime, 100);
    lastTime = now;

    if (running && !paused) {
      input.update(dt);
      engine.update(dt);

      var delta = engine.coins - lastCoins;
      if (delta > 0) { store.wallet += delta; saveStore(); }
      lastCoins = engine.coins;
    }

    renderer.draw(engine, dt);
    renderer.drawHold(engine);
    renderer.drawNext(engine);
    updateHud();
    requestAnimationFrame(frame);
  }

  // ---- 起動 -------------------------------------------------------------
  // デバッグ／自動テスト用のハンドル
  global.USpeakGame = {
    engine: engine,
    renderer: renderer,
    input: input,
    store: store,
    start: startGame,
    setMode: setMode,
    state: function () {
      return { mode: mode, running: running, paused: paused, phase: engine.phase, stats: engine.stats() };
    }
  };

  document.body.setAttribute('data-mode', mode);
  renderer.resize(engine);
  global.addEventListener('resize', function () { renderer.resize(engine); });
  renderWordLog();
  titleOverlay();
  lastTime = performance.now();
  requestAnimationFrame(frame);
})(window);
