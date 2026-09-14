/**
 * Turning ejdict-hand definitions into short Japanese glosses.
 *
 * Kept apart from the build script so it can be unit tested without the
 * source dictionary present and without writing any files.
 */

/** Longest gloss we will show; anything past this is noise in a pop-up. */
const MAX_GLOSS = 12;
/** At most this many synonyms, joined with a Japanese comma. */
const MAX_SENSES = 2;

/** A gloss with no Japanese in it is leftover source apparatus, not a meaning. */
export const HAS_JAPANESE = /[\u3040-\u30ff\u3400-\u9fff]/;

/**
 * Turns one ejdict-hand definition into a gloss short enough to read at a
 * glance.  The notation it uses:
 *   ` / ` separates senses      -- keep the first that survives cleaning
 *   `〈C〉` `〈U〉`                -- countable/uncountable, drop
 *   `《...》`                     -- usage notes, drop
 *   `『...』`                     -- emphasis on the core meaning, unwrap
 *   `(...)`                      -- qualifiers and readings, drop
 *
 * @param {string} definition
 * @returns {string} e.g. "猫", "学校", "幸福な、幸せな"
 */
export function toGloss(definition) {
  for (const sense of definition.split(' / ')) {
    // `=other word` is a cross-reference, not a meaning. Skip to the next
    // sense; a whole entry that is nothing but one is resolved when the
    // source is loaded.
    if (sense.trim().startsWith('=')) continue;

    // Drop the bracketed apparatus first. It matters that this happens before
    // the `『』` pass: grammar notes like `《+『on』+『名』》` carry emphasis
    // marks of their own, and reading those as meanings leaks English
    // prepositions into the gloss.
    // Brackets nest -- "高巣(ワシなどが崖(がけ)の上に作る巣)" -- so strip the
    // innermost pair repeatedly rather than in one pass, which would stop at
    // the first closing bracket and leave the tail behind.
    let stripped = sense;
    for (let pass = 0; pass < 6; pass += 1) {
      const next = stripped
        .replace(/《[^《》]*》/g, '')
        .replace(/〈[^〈〉]*〉/g, '')
        .replace(/（[^（）]*）/g, '')
        .replace(/\([^()]*\)/g, '')
        .replace(/\[[^[\]]*\]/g, '');
      if (next === stripped) break;
      stripped = next;
    }
    // An unbalanced bracket in the source would otherwise drag its contents
    // into the gloss; cut the line there.
    stripped = stripped.split(/[《〈（([]/)[0].replace(/\s+/g, '');

    // `『』` marks the headword's core meaning, so when the entry offers one
    // it beats anything a general clean-up would pick out.
    const core = stripped.match(/『([^』]+)』/g);
    const source = core && core.length
      ? core.map((match) => match.slice(1, -1)).join('、')
      : stripped.replace(/[『』]/g, '');

    const parts = source
      .split(/[;,、；・]/)
      .map((part) => part.trim())
      // A fragment starting with a particle is what is left after a bracketed
      // object was stripped out ("〈食事〉をする" -> "をする"): not a meaning.
      .filter((part) => part && !/^…?を?$/.test(part) && !/^[をがにへとのはもや]/.test(part));
    if (!parts.length) continue;

    const chosen = [];
    let width = 0;
    for (const part of parts.slice(0, MAX_SENSES)) {
      const extra = chosen.length ? 1 : 0;
      if (width + part.length + extra > MAX_GLOSS) break;
      chosen.push(part);
      width += part.length + extra;
    }
    if (!chosen.length) {
      // A single long sense: take it truncated rather than nothing at all.
      return `${parts[0].slice(0, MAX_GLOSS - 1)}…`;
    }
    return chosen.join('、');
  }
  return '';
}

/**
 * Inflected forms are largely absent from the source, so fall back to the
 * base word.  A learner who spells GRIDS is still well served by "格子".
 *
 * @param {string} word
 * @returns {string[]} base forms to try, best first
 */
export function baseForms(word) {
  const forms = [];
  const add = (form) => {
    if (form.length >= 2 && !forms.includes(form)) forms.push(form);
  };
  const stem = word.slice(0, -1);
  const double = /(.)\1$/.test(stem) ? stem.slice(0, -1) : null;

  // Order matters: dropping a single "s" is right far more often than
  // dropping "es", and trying it second lets ACES resolve to AC (alternating
  // current) instead of ACE.
  if (word.endsWith('ies')) add(`${word.slice(0, -3)}y`);
  if (word.endsWith('s')) add(stem);
  if (word.endsWith('es')) add(word.slice(0, -2));
  if (word.endsWith('ing')) {
    const root = word.slice(0, -3);
    add(`${root}e`); // ACING -> ACE, before the bare ACing -> AC
    add(root);
    if (/(.)\1$/.test(root)) add(root.slice(0, -1));
  }
  if (word.endsWith('ed')) {
    add(word.slice(0, -1)); // ACED -> ACE, before ACed -> AC
    const root = word.slice(0, -2);
    add(root);
    if (/(.)\1$/.test(root)) add(root.slice(0, -1));
  }
  if (word.endsWith('ily')) add(`${word.slice(0, -3)}y`);
  if (word.endsWith('ly')) add(word.slice(0, -2));
  if (word.endsWith('er') || word.endsWith('est')) {
    const cut = word.endsWith('er') ? 2 : 3;
    const root = word.slice(0, -cut);
    add(root);
    add(`${root}e`);
    if (/(.)\1$/.test(root)) add(root.slice(0, -1));
  }
  if (double) add(double);
  return forms;
}
