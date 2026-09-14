import test from 'node:test';
import assert from 'node:assert/strict';
import { dictionary } from '../src/core/wordlist.js';
import { toGloss, baseForms } from '../tools/gloss.mjs';

test('everyday words carry a Japanese gloss', () => {
  const expected = {
    cat: '猫',
    dog: '犬',
    water: '水',
    school: '学校',
    eat: '食べる',
    run: '走る',
    peace: '平和',
    music: '音楽',
  };
  for (const [word, gloss] of Object.entries(expected)) {
    assert.equal(dictionary.translate(word), gloss, word);
  }
});

test('translation is case-insensitive and safe for unknown words', () => {
  assert.equal(dictionary.translate('GRIDS'), dictionary.translate('grids'));
  assert.equal(dictionary.translate('School'), '学校');
  assert.equal(dictionary.translate('zzzzz'), '');
  assert.equal(dictionary.translate(''), '');
});

test('inflected forms fall back to the base word', () => {
  assert.equal(dictionary.translate('cats'), dictionary.translate('cat'));
  assert.ok(dictionary.translate('grids'), 'GRIDS should resolve through GRID');
  assert.ok(dictionary.translate('bigger'), 'BIGGER should resolve through BIG');
});

test('most of the word list is covered', () => {
  const coverage = dictionary.translatedCount / dictionary.size;
  assert.ok(coverage > 0.85, `only ${(coverage * 100).toFixed(1)}% translated`);
});

test('every gloss is short enough to read at a glance', () => {
  // Sampled through the public API rather than the raw file, so this also
  // covers the unpacking.
  for (const word of ['cat', 'school', 'friend', 'happy', 'flower', 'morning', 'number']) {
    const gloss = dictionary.translate(word);
    assert.ok(gloss.length > 0 && gloss.length <= 12, `${word}: "${gloss}"`);
  }
});

test('glosses never carry the source dictionary notation', () => {
  for (const word of ['cat', 'smile', 'love', 'aerie', 'acrylic', 'green', 'ship']) {
    const gloss = dictionary.translate(word);
    assert.doesNotMatch(gloss, /[《》〈〉『』()（）[\]]/, `${word}: "${gloss}"`);
    assert.doesNotMatch(gloss, /^=/, `${word}: "${gloss}"`);
  }
});

test('the cleaner keeps the marked core meaning and drops the apparatus', () => {
  assert.equal(toGloss('〈C〉(施設としての)『学校』 / 〈C〉(大学の)『学部』'), '学校');
  assert.equal(toGloss('『猫』;(ライオン,トラ,ヒョウなどの)ネコ科の動物'), '猫');
  assert.equal(toGloss('『幸福な』,幸せな'), '幸福な');
  // Grammar notes carry emphasis marks of their own and must not leak.
  assert.equal(toGloss('『ほほえむ』・〈神などが〉好意を示す《+『on』+『名』》'), 'ほほえむ');
  // Nested brackets.
  assert.equal(toGloss('高巣(ワシなどが崖(がけ)の上などに作る巣)'), '高巣');
  // A leading cross-reference is skipped in favour of the next sense.
  assert.equal(toGloss('=acrylic resin / (画家用の)アクリル絵の具'), 'アクリル絵の具');
  // Nothing usable at all.
  assert.equal(toGloss('=them'), '');
});

test('base forms are tried most-likely first', () => {
  // ACES must reach ACE before AC, which is alternating current.
  const aces = baseForms('aces');
  assert.ok(aces.indexOf('ace') < aces.indexOf('ac'), aces.join(','));
  assert.ok(baseForms('ladies').includes('lady'));
  assert.ok(baseForms('running').includes('run'));
  assert.ok(baseForms('played').includes('play'));
  assert.ok(baseForms('quickly').includes('quick'));
  assert.ok(baseForms('bigger').includes('big'));
});
