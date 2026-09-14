# PUYO U-SPEAK

Puyo Puyo, rebuilt from scratch — and then played in English.

Two games share one engine:

- **CLASSIC / VS COM** — the original rules. Four of a colour touching pops,
  chains multiply, nuisance puyos rain on your opponent.
- **U-SPEAK** — the same field, the same pairs, the same chains, except every
  puyo carries a letter. A run pops when it **spells an English word**, read
  across (→) or down (↓). The longer the word, the bigger the payout in
  **U-Speak Coins**.

```
npm start          # then open http://localhost:8080
npm test           # 76 engine tests, no browser needed
```

No build step and no runtime dependencies: it is plain ES modules, so any
static file server works.

## Controls

| Action | Keys |
| --- | --- |
| Move | `←` `→` (hold to slide) or `A` `D` |
| Rotate | `X` / `↑` clockwise, `Z` anticlockwise |
| Soft drop | `↓` or `S` |
| Hard drop | `Space` |
| Pause | `P` or `Esc` |

On a phone the on-screen pad appears automatically.

## What "faithful" means here

The engine reproduces the mechanics that decide how Puyo Puyo actually plays,
not just the look of it:

- **6 × 13 field.** The 13th row holds puyos but never connects and never
  pops, exactly as in the original. The game ends when the third column of the
  top visible row is buried.
- **Rotation with kicks.** Rotating into a wall or a stack shoves the pair the
  other way; rotating into the floor lifts it; and standing in a one-wide
  shaft, a single rotation performs the **quick turn**, flipping the pair end
  over end.
- **Split drops.** A sideways pair straddling two heights locks, then the
  unsupported half falls on its own.
- **Tsu scoring**, table for table:
  `score = 10 × puyos cleared × (chain power + colour bonus + group bonuses)`,
  with the multiplier clamped to `[1, 999]`. A lone four-group is 40 points, a
  second chain link is 320, a third 640.
- **Nuisance.** 70 points of chain buys one nuisance puyo, the remainder is
  carried rather than lost, garbage beside a pop is swept up with it, incoming
  nuisance is **offset** by what you are holding, and it falls at most five
  rows at a time. An all clear arms the +30 that rides along with your next
  attack.
- **A shuffled colour pool**, not independent rolls, so you never get a
  punishing run of one colour — and the opening pairs are held to three
  colours.
- **Delayed auto-shift** on movement, lock delay with a reset cap, and a fall
  speed that steps up every 20 pairs.

## How U-SPEAK works

`Game` knows nothing about colours or words. It asks a **rule object** what
should pop, and everything else — gravity, chains, scoring multipliers,
nuisance, the loss condition — is shared. `ColorRule` looks for four touching
puyos of a colour; `WordRule` looks for words. That is the whole difference.

**Spelling.** Words read left-to-right across a row and top-to-bottom down a
column, like a crossword. A gap or a nuisance puyo breaks the line. One puyo
can be the last letter of an across word and the first of a down word at the
same time; it pops once, and both words score.

**Longest match wins.** Each line is solved with a little dynamic program that
maximises the *square* of each word's length, so `SCHOOL` is taken over the
short words hiding inside it, and `CATS` over `CAT`. Two words that do not
overlap both pop.

**Chains still matter.** When a word pops, what was resting on it falls — and
if that spells something, it is the second link of a chain, worth double, then
triple, and so on. Chaining beats spelling the same two words simultaneously,
just as it does in the original.

**Build backwards.** This is the skill the mode is really about. A short word
pops the moment it is spelled, so `CAT` vanishes before you can add the `S`.
Lay the *last* letter down first and work back towards the first — `S`, `T`,
`A`, `C` — and no intermediate run is ever a word until the whole thing is.
It is chain planning, in English.

**Scoring and coins.**

| Word length | Points | U-Speak Coins |
| --- | ---: | ---: |
| 3 | 30 | 1 |
| 4 | 90 | 2 |
| 5 | 220 | 4 |
| 6 | 480 | 8 |
| 7 | 960 | 14 |
| 8 | 1800 | 24 |

Everyday English earns a further ×1.2, both are multiplied by the chain, and
coins are banked across every session. A six-letter word is worth sixteen
three-letter words: the whole mode is built to make you hold out for the long
one.

**The letters are not uniform.** They are drawn at the frequencies of common
short English words with the vowels nudged up, and if four consonants come out
in a row the next draw is forced to be a vowel, so the field cannot lock up
into something unspellable. Q is left out of the bag entirely — without a U
beside it, a Q is a dead square for the rest of the game.

**Shortest word** is a difficulty setting. At 3 letters short words pop
constantly, which suits a learner; at 4 or 5 you have to build.

Every word you spell goes into the **word book**, which is kept between
sessions along with your coins and high scores.

## Layout

```
src/
  core/          the engine -- no DOM anywhere in here
    board.js       the field: gravity, connectivity, nuisance splash
    piece.js       the falling pair: rotation, kicks, quick turn, locking
    game.js        the state machine: falling -> lock -> chain -> nuisance
    score.js       Tsu scoring tables
    queue.js       the pair queue and its preview
    simulate.js    headless chain resolution, used by the CPU
    ai.js          the CPU player
    rules/
      colorRule.js   four of a colour
      wordRule.js    English words, across and down
  data/
    dictionary.js  generated word list (see below)
    letters.js     letter frequencies and colour grouping
  ui/              canvas renderer, input, HUD, palette
  storage.js       coins, high scores, word book, settings
tools/
  build-dictionary.mjs   regenerates src/data/dictionary.js
  serve.mjs              the dev server behind `npm start`
tests/                   node:test, run with `npm test`
```

The engine is pure and deterministic: give `Game` a seed and it replays move
for move, which is what the tests rely on.

## The dictionary

33,999 words of 3 to 8 letters, generated from [SCOWL][scowl] tiers 10–50 by
`npm run build:dict` and committed so the game needs no build step. Proper
nouns are dropped, and a blocklist keeps profanity out of a game aimed at
English learners. Words from SCOWL tiers 10 and 20 are marked as everyday
English: those are the ones the game highlights and pays a bonus for.

> Word lists derived from SCOWL, Copyright 2000-2016 by Kevin Atkinson.
> See `src/data/dictionary.js` for the full permission notice.

[scowl]: http://wordlist.aspell.net/
