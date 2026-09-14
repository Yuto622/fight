/* ルールの自動テスト / Headless rule tests.
 *   node tests/engine.test.js
 * DOM を使わない層（辞書・単語判定・回転・消去・得点）だけを検証する。 */
'use strict';

const path = require('path');
const vm = require('vm');
const fs = require('fs');

// ブラウザ用スクリプトを共有の window に読み込む
const sandbox = { performance: { now: () => Date.now() }, Math, JSON, console };
sandbox.window = sandbox;
vm.createContext(sandbox);
['js/dictionary.js', 'js/meanings.js', 'js/words.js', 'js/difficulty.js', 'js/tetromino.js', 'js/engine.js'].forEach((f) => {
  const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  vm.runInContext(src, sandbox, { filename: f });
});

const { Words, Tetromino, TetrisEngine, Difficulty } = sandbox;

let passed = 0;
const failures = [];
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (err) {
    failures.push(name + ' — ' + err.message);
    console.log('  FAIL ' + name + ' — ' + err.message);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) {
  if (a !== b) throw new Error((msg || 'not equal') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b));
}

function newEngine(mode, difficulty) {
  const e = new TetrisEngine({
    mode: mode || 'classic',
    difficulty: Difficulty.get(difficulty || 'normal')
  });
  e.start();
  return e;
}
function fillRow(engine, r, skipCols, letter) {
  for (let c = 0; c < engine.cols; c++) {
    if (skipCols && skipCols.indexOf(c) >= 0) continue;
    engine.board[r][c] = { type: 'I', color: '#fff', dark: '#000', letter: letter || null };
  }
}
function place(engine, r, c, letter) {
  engine.board[r][c] = { type: 'I', color: '#fff', dark: '#000', letter: letter };
}
function writeWord(engine, r, c, word, vertical) {
  for (let i = 0; i < word.length; i++) {
    if (vertical) place(engine, r + i, c, word[i]);
    else place(engine, r, c + i, word[i]);
  }
}
/* 消去アニメーションぶんの時間を進め、盤面が落ち着くまで回す */
function settle(engine) {
  for (let i = 0; i < 300 && (engine.phase === 'clearing' || engine.phase === 'entry'); i++) {
    engine.update(200);
  }
}

console.log('\n— 辞書 / dictionary —');
check('6,000語以上を読み込む', () => assert(Words.size() > 6000, 'size=' + Words.size()));
check('実在する単語を受け付ける', () => {
  ['cat', 'water', 'school', 'picture', 'elephant'].forEach((w) => assert(Words.isWord(w), w));
});
check('でたらめな綴りを弾く', () => {
  ['xqz', 'aaaa', 'zzzzz', 'qwrtp'].forEach((w) => assert(!Words.isWord(w), w));
});
check('2文字以下は単語にしない', () => assert(!Words.isWord('at') && !Words.isWord('a')));
check('日本語の意味を引ける', () => eq(Words.meaningOf('water'), '水'));

console.log('\n— 文字袋 / letter bag —');
check('1ミノにつき4文字', () => eq(Words.drawLetters(4).length, 4));
check('母音が必ず1つ以上入る', () => {
  for (let i = 0; i < 400; i++) {
    const letters = Words.drawLetters(4);
    assert(letters.some((c) => 'aeiou'.indexOf(c) >= 0), letters.join(''));
    assert(!letters.every((c) => 'aeiou'.indexOf(c) >= 0), '母音だけになった: ' + letters.join(''));
  }
});

console.log('\n— 得点 / scoring —');
check('長い単語ほど倍率が上がる', () => {
  const mults = [3, 4, 5, 6, 7, 8].map((n) => Words.lengthMultiplier(n));
  for (let i = 1; i < mults.length; i++) assert(mults[i] > mults[i - 1], 'not increasing');
});
check('8文字は3文字よりはるかに高い', () => {
  assert(Words.coinsFor('elephant', 1) > Words.coinsFor('cat', 1) * 8);
});
check('連鎖で倍率が増える', () => {
  assert(Words.coinsFor('water', 3) > Words.coinsFor('water', 1));
});

console.log('\n— 回転 / SRS —');
check('全ミノが4セル・4状態', () => {
  Tetromino.TYPES.forEach((t) => {
    const p = Tetromino.PIECES[t];
    eq(p.states.length, 4, t);
    p.states.forEach((s) => eq(s.length, 4, t));
  });
});
check('O ミノは回転しても形が変わらない', () => {
  const o = Tetromino.PIECES.O.states;
  const key = (s) => s.map((c) => c.join(',')).sort().join('|');
  for (let i = 1; i < 4; i++) eq(key(o[i]), key(o[0]));
});
check('左端で I ミノがウォールキックする', () => {
  const e = newEngine();
  e.active = { type: 'I', letters: null, rot: 0, x: -1, y: 10 };
  assert(e.rotate(1), '回転できない');
  e.cellsOf(e.active).forEach((cell) => assert(cell.c >= 0 && cell.c < e.cols, '盤外に出た'));
});
check('床の上で回転できる（キックで持ち上がる）', () => {
  const e = newEngine();
  for (let r = e.rows - 2; r < e.rows; r++) fillRow(e, r, [4, 5]);
  e.active = { type: 'T', letters: null, rot: 0, x: 3, y: e.rows - 4 };
  const before = JSON.stringify([e.active.x, e.active.y, e.active.rot]);
  e.rotate(1);
  assert(JSON.stringify([e.active.x, e.active.y, e.active.rot]) !== before, '状態が変わらない');
  assert(!e.collides(e.active, e.active.rot, e.active.x, e.active.y), 'めり込んでいる');
});

console.log('\n— 7-bag —');
check('7個ごとに全種類が1回ずつ出る', () => {
  const e = newEngine();
  e.bag = [];                 // 新しい bag から数える
  const seen = [];
  for (let i = 0; i < 7; i++) seen.push(e.nextFromBag().type);
  eq(new Set(seen).size, 7, seen.join(''));
});

console.log('\n— ライン消去 / line clears —');
check('1ライン消去で 100 × レベル', () => {
  const e = newEngine();
  e.score = 0;
  fillRow(e, e.rows - 1, [0]);
  e.active = { type: 'I', letters: null, rot: 1, x: -2, y: e.rows - 4 };
  e.lockPiece();
  settle(e);
  eq(e.lines, 1);
  eq(e.score, 100);
});
check('テトリス（4ライン）は 800 点', () => {
  const e = newEngine();
  e.score = 0;
  for (let r = e.rows - 4; r < e.rows; r++) fillRow(e, r, [0]);
  e.active = { type: 'I', letters: null, rot: 1, x: -2, y: e.rows - 4 };
  e.lockPiece();
  settle(e);
  eq(e.lines, 4);
  assert(e.score >= 800, 'score=' + e.score);
  assert(e.backToBack, 'B2B フラグが立たない');
});
check('消えた行の上が正しく詰まる', () => {
  const e = newEngine();
  fillRow(e, e.rows - 1, [0]);
  place(e, e.rows - 2, 3);              // 浮いている1マス
  e.active = { type: 'I', letters: null, rot: 1, x: -2, y: e.rows - 4 };
  e.lockPiece();
  settle(e);
  assert(e.board[e.rows - 1][3], '上のブロックが落ちてこない');
  let count = 0;
  for (let r = 0; r < e.rows; r++) for (let c = 0; c < e.cols; c++) if (e.board[r][c]) count++;
  eq(count, 4, '残ったセル数'); // I ミノ4個 + 浮き1個 - 消えた1行(10) ... 下記参照
});
check('10段積み上がらなければゲームオーバーにならない', () => {
  const e = newEngine();
  for (let i = 0; i < 5; i++) { e.hardDrop(); settle(e); }
  assert(e.phase !== 'over', 'phase=' + e.phase);
});
check('天井まで埋まるとゲームオーバー', () => {
  const e = newEngine();
  let over = false;
  e.emit = (type) => { if (type === 'gameover') over = true; };
  for (let r = e.hidden; r < e.rows; r++) fillRow(e, r, [9]);
  for (let i = 0; i < 40 && !over; i++) { if (e.active) e.hardDrop(); settle(e); }
  assert(over, 'ゲームオーバーにならない');
});

console.log('\n— 単語モード / word mode —');
check('横に並んだ単語を検出する', () => {
  const e = newEngine('word');
  writeWord(e, e.rows - 1, 2, 'cat');
  const found = Words.findWords(e.board, e.rows, e.cols);
  eq(found.length, 1);
  eq(found[0].word, 'cat');
  eq(found[0].dir, 'h');
});
check('縦に並んだ単語を検出する', () => {
  const e = newEngine('word');
  writeWord(e, e.rows - 5, 4, 'water', true);
  const found = Words.findWords(e.board, e.rows, e.cols);
  assert(found.some((w) => w.word === 'water' && w.dir === 'v'), JSON.stringify(found));
});
check('長い単語を優先して切り出す', () => {
  const e = newEngine('word');
  writeWord(e, e.rows - 1, 0, 'water');   // "wat" ではなく "water"
  const found = Words.findWords(e.board, e.rows, e.cols);
  eq(found[0].word, 'water');
});
check('単語でない並びは消えない', () => {
  const e = newEngine('word');
  writeWord(e, e.rows - 1, 0, 'xqzv');
  eq(Words.findWords(e.board, e.rows, e.cols).length, 0);
});
check('単語が消えてコインが入る', () => {
  const e = newEngine('word');
  writeWord(e, e.rows - 1, 2, 'ca');
  // O ミノのセル順は [左上, 右上, 左下, 右下]。左下に 't' を置いて "cat" にする
  e.active = { type: 'O', letters: ['x', 'z', 't', 'q'], rot: 0, x: 4, y: e.rows - 2 };
  e.lockPiece();      // (rows-1, 4) に 't' が入り "cat" が成立
  settle(e);
  eq(e.wordCount, 1);
  eq(e.wordLog[0].word, 'cat');
  assert(e.coins > 0, 'コインが増えない');
  let remaining = '';
  for (let r = 0; r < e.rows; r++) {
    for (let c = 0; c < e.cols; c++) if (e.board[r][c]) remaining += e.board[r][c].letter;
  }
  eq(remaining.split('').sort().join(''), 'qxz', '"cat" の3マスだけが消える');
});
check('消えたあと上のブロックが落ちる（列ごとの重力）', () => {
  const e = newEngine('word');
  writeWord(e, e.rows - 1, 0, 'cat');
  place(e, e.rows - 2, 1, 'z');    // 't' の上に乗っている無関係なブロック
  e.beginResolve();
  settle(e);
  assert(e.board[e.rows - 1][1] && e.board[e.rows - 1][1].letter === 'z', '落ちてこない');
});
check('連鎖が起きる', () => {
  const e = newEngine('word');
  // 下段の "cat" が消えると、上段の d o g が落ちて "dog" が揃う
  writeWord(e, e.rows - 1, 0, 'cat');
  place(e, e.rows - 2, 0, 'd');
  place(e, e.rows - 3, 1, 'o');
  place(e, e.rows - 4, 2, 'g');
  e.beginResolve();
  settle(e);
  eq(e.wordCount, 2);
  assert(e.wordLog.some((w) => w.word === 'dog'), JSON.stringify(e.wordLog));
  assert(e.longestChain >= 2, 'chain=' + e.longestChain);
});
check('連鎖ボーナスでコインが増える', () => {
  const a = Words.coinsFor('dog', 1);
  const b = Words.coinsFor('dog', 2);
  assert(b > a, a + ' -> ' + b);
});
check('単語モードでも揃った行は消える', () => {
  const e = newEngine('word');
  fillRow(e, e.rows - 1, [0], 'q');   // 単語にならない文字で埋める
  e.active = { type: 'I', letters: ['q', 'q', 'q', 'q'], rot: 1, x: -2, y: e.rows - 4 };
  e.lockPiece();
  settle(e);
  eq(e.lines, 1);
  assert(e.coins > 0, 'ライン消去のコインが入らない');
});
check('引き直しで4文字とも入れ替わりうる', () => {
  const e = newEngine('word');
  const before = e.active.letters.join('');
  let changed = false;
  for (let i = 0; i < 20 && !changed; i++) {
    e.rerollLetters();
    if (e.active.letters.join('') !== before) changed = true;
  }
  assert(changed, '文字が変わらない');
});
check('ミノを置くと文字も一緒に盤面へ残る', () => {
  const e = newEngine('word');
  const letters = e.active.letters.slice();
  e.hardDrop();
  settle(e);
  let found = 0;
  for (let r = 0; r < e.rows; r++) {
    for (let c = 0; c < e.cols; c++) {
      if (e.board[r][c]) { assert(e.board[r][c].letter, '文字がない'); found++; }
    }
  }
  assert(found <= 4, 'cells=' + found);   // 単語ができた分だけ減る
  eq(letters.length, 4);
});

console.log('\n— T-Spin —');
check('T-Spin ダブルを判定する', () => {
  const e = newEngine();
  const bottom = e.rows - 1;
  // 下段は列4だけ空け、その上の段は列3〜5を空ける。左上にオーバーハングを置く。
  for (let c = 0; c < e.cols; c++) {
    if (c !== 4) place(e, bottom, c);
    if (c < 3 || c > 5) place(e, bottom - 1, c);
  }
  place(e, bottom - 2, 3);
  e.active = { type: 'T', letters: null, rot: 2, x: 3, y: bottom - 2 };
  e.lastActionRotate = true;
  e.lastKickIndex = 0;
  eq(e.detectTSpin(), 'tspin');
});
check('T-Spin ダブルは 1200 × レベル', () => {
  const e = newEngine();
  e.score = 0;
  const bottom = e.rows - 1;
  for (let c = 0; c < e.cols; c++) {
    if (c !== 4) place(e, bottom, c);
    if (c < 3 || c > 5) place(e, bottom - 1, c);
  }
  place(e, bottom - 2, 3);
  e.active = { type: 'T', letters: null, rot: 2, x: 3, y: bottom - 2 };
  e.lastActionRotate = true;
  e.lastKickIndex = 0;
  e.lockPiece();
  settle(e);
  eq(e.lines, 2);
  eq(e.score, 1200);
  assert(e.backToBack, 'T-Spin は B2B 対象');
});

console.log('\n— 通し動作 / soak —');
check('5行同時消しでも得点が壊れない', () => {
  const e = newEngine();
  e.score = 0;
  for (let r = e.rows - 5; r < e.rows; r++) fillRow(e, r, [0]);
  // 5行をまとめて消す（単語モードの連鎖で起こりうる状況）
  e.applyLineClear({ rows: [e.rows - 5, e.rows - 4, e.rows - 3, e.rows - 2, e.rows - 1] });
  eq(e.lines, 5);
  assert(Number.isFinite(e.score) && e.score > 0, 'score=' + e.score);
});
check('ランダムに200手打っても数値が壊れない', () => {
  for (let game = 0; game < 12; game++) {
    const e = newEngine('word');
    let placed = 0;
    while (e.phase !== 'over' && placed < 200) {
      const rot = (Math.random() * 4) | 0;
      for (let i = 0; i < rot; i++) e.rotate(1);
      const dir = Math.random() < 0.5 ? -1 : 1;
      const steps = (Math.random() * 6) | 0;
      for (let i = 0; i < steps; i++) e.move(dir);
      if (Math.random() < 0.15) e.holdPiece();
      e.hardDrop();
      settle(e);
      placed++;
      assert(Number.isFinite(e.score), 'score が NaN: ' + e.score);
      assert(Number.isFinite(e.coins), 'coins が NaN: ' + e.coins);
      assert(e.level >= 1, 'level=' + e.level);
      // 盤面のセル数がおかしくならないこと
      for (let r = 0; r < e.rows; r++) {
        for (let c = 0; c < e.cols; c++) {
          const cell = e.board[r][c];
          if (cell) assert(typeof cell.letter === 'string', '文字が欠けている');
        }
      }
    }
  }
});
check('CLASSIC を200手打っても落ちない', () => {
  for (let game = 0; game < 8; game++) {
    const e = newEngine('classic');
    let placed = 0;
    while (e.phase !== 'over' && placed < 200) {
      for (let i = 0, n = (Math.random() * 4) | 0; i < n; i++) e.rotate(1);
      const dir = Math.random() < 0.5 ? -1 : 1;
      for (let i = 0, n = (Math.random() * 6) | 0; i < n; i++) e.move(dir);
      e.hardDrop();
      settle(e);
      placed++;
      assert(Number.isFinite(e.score), 'score=' + e.score);
    }
  }
});

console.log('\n— 難易度 / difficulty —');
check('4段階そろっている', () => {
  eq(Difficulty.ORDER.length, 4);
  Difficulty.ORDER.forEach((k) => assert(Difficulty.LEVELS[k], k));
});
check('難しいほど落下が速くロックディレイが短い', () => {
  const levels = Difficulty.ORDER.map((k) => Difficulty.get(k));
  for (let i = 1; i < levels.length; i++) {
    assert(levels[i].gravityScale > levels[i - 1].gravityScale, 'gravity ' + levels[i].key);
    assert(levels[i].lockDelay < levels[i - 1].lockDelay, 'lockDelay ' + levels[i].key);
    assert(levels[i].coinMult > levels[i - 1].coinMult, 'coinMult ' + levels[i].key);
  }
});
check('EASY は NORMAL よりゆっくり落ちる', () => {
  const easy = newEngine('classic', 'easy');
  const hard = newEngine('classic', 'hard');
  const start = easy.active.y;
  easy.update(900);
  hard.update(900);
  assert(hard.active.y - start >= easy.active.y - start, 'hard の方が落ちていない');
});
check('EXPERT は NEXT が1個・ゴーストなし設定', () => {
  const e = newEngine('classic', 'expert');
  eq(e.queue.length, 1);
  eq(e.nextCount, 1);
  eq(Difficulty.get('expert').ghost, false);
});
check('HARD/EXPERT は開始レベルが上がる', () => {
  eq(newEngine('classic', 'hard').level, 3);
  eq(newEngine('classic', 'expert').level, 5);
});
check('EXPERT では3文字の単語が成立しない', () => {
  const e = newEngine('word', 'expert');
  writeWord(e, e.rows - 1, 2, 'cat');
  eq(Words.findWords(e.board, e.rows, e.cols, e.diff.minWordLength).length, 0);
  // 4文字ならちゃんと消える
  const e2 = newEngine('word', 'expert');
  writeWord(e2, e2.rows - 1, 2, 'bird');
  eq(Words.findWords(e2.board, e2.rows, e2.cols, e2.diff.minWordLength)[0].word, 'bird');
});
check('EASY の方が母音を多く引く', () => {
  const count = (bias) => {
    let v = 0;
    for (let i = 0; i < 3000; i++) {
      Words.drawLetters(4, bias).forEach((c) => { if ('aeiou'.indexOf(c) >= 0) v++; });
    }
    return v;
  };
  const easy = count(Difficulty.get('easy').vowelBias);
  const expert = count(Difficulty.get('expert').vowelBias);
  assert(easy > expert * 1.1, easy + ' vs ' + expert);
});
check('難易度でコイン倍率がかかる', () => {
  const make = (key) => {
    const e = newEngine('word', key);
    writeWord(e, e.rows - 1, 0, 'water');
    e.beginResolve();
    settle(e);
    return e.coins;
  };
  assert(make('expert') > make('easy'), 'expert の方が少ない');
});
check('難易度を変えても得点が壊れない', () => {
  Difficulty.ORDER.forEach((key) => {
    ['classic', 'word'].forEach((m) => {
      const e = newEngine(m, key);
      let placed = 0;
      while (e.phase !== 'over' && placed < 60) {
        for (let i = 0, n = (Math.random() * 4) | 0; i < n; i++) e.rotate(1);
        for (let i = 0, n = (Math.random() * 6) | 0; i < n; i++) e.move(Math.random() < 0.5 ? -1 : 1);
        e.hardDrop();
        settle(e);
        placed++;
        assert(Number.isFinite(e.score), key + '/' + m + ' score=' + e.score);
        assert(Number.isFinite(e.coins), key + '/' + m + ' coins=' + e.coins);
      }
    });
  });
});

console.log('\n— 結果 —');
console.log('  ' + passed + ' passed, ' + failures.length + ' failed\n');
if (failures.length) { failures.forEach((f) => console.log('  * ' + f)); process.exit(1); }
