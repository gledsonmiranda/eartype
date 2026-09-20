/**
 * SPEC §5 — normalization for lenient correction.
 *
 * The comparison is NOT string against string: every position becomes a
 * `Token` carrying a **set of accepted forms**. Two tokens match when their
 * sets intersect. That is what resolves the ambiguity of `he's` (= `he is` or
 * `he has`) without having to guess which one the speaker meant.
 *
 * Canonicalization runs in two passes (§5.1):
 *  1. word pre-pass — contractions and reductions become the expanded form,
 *     which is the canonical one (`gonna` → `going to`), so both sides reach
 *     the diff with the same token count;
 *  2. sentence pre-pass — word sequences that spell a number become the digit
 *     (`twenty one` → `21`).
 */

import type { CorrectionMode } from '@/types';

export type Token = {
  /** Canonical form — the comparison key. */
  canonical: string;
  /** Every form accepted at this position. Always contains `canonical`. */
  variants: string[];
  /** What to render on screen for this token. */
  surface: string;
};

// -------------------------------------------------------- tables (§5.1)

/**
 * Contractions and reductions → expanded form.
 * A `string[]` entry is a variant set: expanding it would mean picking wrong.
 */
const CONTRACTIONS: Record<string, (string | string[])[]> = {
  // Standard contractions
  "i'm": ['i', 'am'],
  "i've": ['i', 'have'],
  "i'll": ['i', 'will'],
  "i'd": ['i', ['would', 'had']],
  "you're": ['you', 'are'],
  "you've": ['you', 'have'],
  "you'll": ['you', 'will'],
  "you'd": ['you', ['would', 'had']],
  "he's": ['he', ['is', 'has']],
  "he'll": ['he', 'will'],
  "he'd": ['he', ['would', 'had']],
  "she's": ['she', ['is', 'has']],
  "she'll": ['she', 'will'],
  "she'd": ['she', ['would', 'had']],
  "it's": ['it', ['is', 'has']],
  "it'll": ['it', 'will'],
  "it'd": ['it', ['would', 'had']],
  "we're": ['we', 'are'],
  "we've": ['we', 'have'],
  "we'll": ['we', 'will'],
  "we'd": ['we', ['would', 'had']],
  "they're": ['they', 'are'],
  "they've": ['they', 'have'],
  "they'll": ['they', 'will'],
  "they'd": ['they', ['would', 'had']],
  "that's": ['that', ['is', 'has']],
  "that'll": ['that', 'will'],
  "that'd": ['that', ['would', 'had']],
  "there's": ['there', ['is', 'has']],
  "there're": ['there', 'are'],
  "there'll": ['there', 'will'],
  "here's": ['here', ['is', 'has']],
  "what's": ['what', ['is', 'has', 'does']],
  "what're": ['what', 'are'],
  "what'll": ['what', 'will'],
  "who's": ['who', ['is', 'has']],
  "who're": ['who', 'are'],
  "where's": ['where', ['is', 'has']],
  "when's": ['when', ['is', 'has']],
  "why's": ['why', ['is', 'has']],
  "how's": ['how', ['is', 'has']],
  "let's": ['let', 'us'],

  // Negatives
  "isn't": ['is', 'not'],
  "aren't": ['are', 'not'],
  "wasn't": ['was', 'not'],
  "weren't": ['were', 'not'],
  "don't": ['do', 'not'],
  "doesn't": ['does', 'not'],
  "didn't": ['did', 'not'],
  "can't": ['can', 'not'],
  cannot: ['can', 'not'],
  "won't": ['will', 'not'],
  "wouldn't": ['would', 'not'],
  "shouldn't": ['should', 'not'],
  "couldn't": ['could', 'not'],
  "mustn't": ['must', 'not'],
  "shan't": ['shall', 'not'],
  "haven't": ['have', 'not'],
  "hasn't": ['has', 'not'],
  "hadn't": ['had', 'not'],
  "ain't": [['am', 'is', 'are', 'has', 'have'], 'not'],

  // Colloquial reductions
  gonna: ['going', 'to'],
  wanna: ['want', 'to'],
  gotta: ['got', 'to'],
  hafta: ['have', 'to'],
  hasta: ['has', 'to'],
  tryna: ['trying', 'to'],
  oughta: ['ought', 'to'],

  // `of` reductions
  kinda: ['kind', 'of'],
  sorta: ['sort', 'of'],
  outta: ['out', 'of'],
  lotta: ['lot', 'of'],
  cuppa: ['cup', 'of'],

  // Modal + have
  shoulda: ['should', 'have'],
  "should've": ['should', 'have'],
  woulda: ['would', 'have'],
  "would've": ['would', 'have'],
  coulda: ['could', 'have'],
  "could've": ['could', 'have'],
  musta: ['must', 'have'],
  "must've": ['must', 'have'],
  mighta: ['might', 'have'],
  "might've": ['might', 'have'],

  // Reduced pronouns
  lemme: ['let', 'me'],
  gimme: ['give', 'me'],
  "'em": ['them'],
  "y'all": ['you', 'all'],
  yall: ['you', 'all'],
  dunno: ['do', 'not', 'know'],
  "y'know": ['you', 'know'],
  ya: ['you'],

  // Others
  "'cause": ['because'],
  cuz: ['because'],
  coz: ['because'],
  cause: ['because'],
  "c'mon": ['come', 'on'],
  cmon: ['come', 'on'],
  "'bout": ['about'],
  "'round": ['around'],
  "'til": ['until'],
  til: ['until'],
  till: ['until'],
};

/**
 * Apostrophe-less forms that are real words **and** audibly different from the
 * contraction. Tolerance would cost real information here: a listener hears
 * `well` apart from `we'll`, so accepting both would forgive a listening miss.
 *
 * `its`/`it's` and `lets`/`let's` are deliberately left out — they sound
 * identical, and demanding the apostrophe would be grading spelling in a
 * listening exercise.
 */
const APOSTROPHE_LESS_COLLISIONS = new Set([
  'well',
  'were',
  'ill',
  'id',
  'wed',
  'hell',
  'shell',
  'shed',
  'hed',
  'whod',
]);

/** Derived table: `Im` → the same expansion as `I'm`. */
const CONTRACTIONS_WITHOUT_APOSTROPHE: Record<string, (string | string[])[]> = (() => {
  const derived: Record<string, (string | string[])[]> = {};
  for (const [form, expansion] of Object.entries(CONTRACTIONS)) {
    if (!form.includes("'")) continue;
    const bare = form.replace(/'/g, '');
    if (bare === form) continue;
    if (APOSTROPHE_LESS_COLLISIONS.has(bare)) continue;
    if (CONTRACTIONS[bare]) continue;
    derived[bare] = expansion;
  }
  return derived;
})();

/** §5 — US/UK spelling. Canonical: the US form. */
const US_UK: Record<string, string> = {
  colour: 'color',
  favourite: 'favorite',
  behaviour: 'behavior',
  neighbour: 'neighbor',
  labour: 'labor',
  honour: 'honor',
  humour: 'humor',
  flavour: 'flavor',
  rumour: 'rumor',
  realise: 'realize',
  realised: 'realized',
  organise: 'organize',
  organised: 'organized',
  recognise: 'recognize',
  recognised: 'recognized',
  apologise: 'apologize',
  analyse: 'analyze',
  analysed: 'analyzed',
  emphasise: 'emphasize',
  travelling: 'traveling',
  travelled: 'traveled',
  cancelled: 'canceled',
  modelling: 'modeling',
  labelled: 'labeled',
  centre: 'center',
  theatre: 'theater',
  metre: 'meter',
  litre: 'liter',
  defence: 'defense',
  offence: 'offense',
  licence: 'license',
  practise: 'practice',
  grey: 'gray',
  catalogue: 'catalog',
  dialogue: 'dialog',
  programme: 'program',
  towards: 'toward',
  maths: 'math',
};

/** §5 — ASR filler: leaving it out is not an error, and neither is typing it. */
const FILLERS = new Set([
  'uh',
  'uhh',
  'uhhh',
  'uhm',
  'um',
  'umm',
  'ummm',
  'mm',
  'mmm',
  'hm',
  'hmm',
  'hmmm',
  'er',
  'erm',
  'eh',
]);

// ------------------------------------------------------- numbers (§5.2)

const UNITS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const ORDINALS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  eleventh: 11,
  twelfth: 12,
  thirteenth: 13,
  fourteenth: 14,
  fifteenth: 15,
  sixteenth: 16,
  seventeenth: 17,
  eighteenth: 18,
  nineteenth: 19,
  twentieth: 20,
  thirtieth: 30,
  fortieth: 40,
  fiftieth: 50,
  hundredth: 100,
};

const isNumberWord = (word: string): boolean =>
  word in UNITS || word in TENS || word === 'hundred' || word === 'thousand';

/** `21` → `21st`, `3` → `3rd`. */
export function ordinalSuffix(n: number): string {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/**
 * Adds up a sequence of number words: `one hundred twenty five` → 125.
 *
 * Grammar matters: `twenty five` is 25, but `one two three` is **not** 6 —
 * those are three separate numbers. Two units in a row (or two tens) void the
 * sequence, and the tokens stay apart.
 */
type NumberWordKind = 'none' | 'unit' | 'ten' | 'scale';

function addUpNumberWords(words: string[]): number | null {
  let total = 0;
  let partial = 0;
  let previous: NumberWordKind = 'none';

  for (const word of words) {
    if (word in UNITS) {
      if (previous === 'unit') return null;
      partial += UNITS[word];
      previous = 'unit';
    } else if (word in TENS) {
      if (previous === 'unit' || previous === 'ten') return null;
      partial += TENS[word];
      previous = 'ten';
    } else if (word === 'hundred') {
      if (previous === 'scale') return null;
      partial = (partial === 0 ? 1 : partial) * 100;
      previous = 'scale';
    } else if (word === 'thousand') {
      if (previous === 'scale' && partial === 0) return null;
      total += (partial === 0 ? 1 : partial) * 1000;
      partial = 0;
      previous = 'scale';
    } else {
      return null;
    }
  }

  return previous === 'none' ? null : total + partial;
}

/**
 * Turns a sequence of number words into a value.
 *
 * Year rule: two halves worth 10–99 each (`nineteen ninety` → 1990,
 * `twenty twenty-four` → 2024). `twenty five` does not qualify because the
 * second half is worth 5 — it stays 25.
 */
export function numberFromWords(words: string[]): number | null {
  if (words.length === 0) return null;
  if (!words.every(isNumberWord)) return null;

  if (words.length >= 2 && !words.includes('hundred') && !words.includes('thousand')) {
    const head = addUpNumberWords(words.slice(0, 1));
    const tail = addUpNumberWords(words.slice(1));
    if (head !== null && tail !== null && head >= 10 && tail >= 10 && tail <= 99) {
      return head * 100 + tail;
    }
  }

  return addUpNumberWords(words);
}

// ----------------------------------------------------------- tokenization

const APOSTROPHES = /[’‘‛`´]/g;
const QUOTES = /[“”„]/g;

/** Edge punctuation. A leading apostrophe survives (`'em`, `'cause`). */
const LEADING_PUNCTUATION = /^[^\p{L}\p{N}'$]+/u;
const TRAILING_PUNCTUATION = /[^\p{L}\p{N}%']+$/u;

function trimPunctuation(word: string): string {
  return word
    .replace(LEADING_PUNCTUATION, '')
    .replace(TRAILING_PUNCTUATION, '')
    .replace(/'+$/, '');
}

function makeToken(canonical: string, surface: string, variants?: string[]): Token {
  const all = variants && variants.length > 0 ? variants : [canonical];
  return { canonical, surface, variants: [...new Set(all)] };
}

/**
 * `N.A.S.A.` → `nasa`; `U.S.` → `us`.
 * The final dot is already gone from edge trimming, so the last initial may
 * come without one — hence the trailing `\.?`.
 */
const ACRONYM = /^\p{L}(?:\.\p{L})+\.?$/u;

function expandAcronym(word: string): string {
  return ACRONYM.test(word) ? word.replace(/\./g, '') : word;
}

function expandContraction(form: string, surface: string): Token[] | null {
  const expansion = CONTRACTIONS[form] ?? CONTRACTIONS_WITHOUT_APOSTROPHE[form];
  if (!expansion) return null;

  return expansion.map((part, i) => {
    const variants = Array.isArray(part) ? part : [part];
    // A contraction that collapses to a single word keeps its original spelling.
    const shown = expansion.length === 1 && i === 0 ? surface : variants[0];
    return makeToken(variants[0], shown, variants);
  });
}

/** One raw word becomes zero, one or more canonical tokens. */
function tokenizeWord(raw: string): Token[] {
  const surface = raw.replace(APOSTROPHES, "'").replace(QUOTES, '"');
  const trimmed = trimPunctuation(surface);
  if (trimmed === '') return [];

  // `10%` → `10 percent`
  const percentage = /^(\d+)%$/.exec(trimmed);
  if (percentage) {
    return [makeToken(percentage[1], percentage[1]), makeToken('percent', 'percent')];
  }

  // Digit ordinal: `1st`, `22nd`
  const ordinal = /^(\d+)(?:st|nd|rd|th)$/i.exec(trimmed);
  if (ordinal) {
    return [makeToken(ordinalSuffix(Number(ordinal[1])), trimmed)];
  }

  // Plain digits: drop the thousands separator, keep the value.
  if (/^\d[\d,.]*$/.test(trimmed)) {
    const digitsOnly = trimmed.replace(/[,.]/g, '');
    if (/^\d+$/.test(digitsOnly)) return [makeToken(String(Number(digitsOnly)), trimmed)];
  }

  const lower = expandAcronym(trimmed).toLowerCase();

  if (FILLERS.has(lower)) return [];

  const expanded = expandContraction(lower, trimmed);
  if (expanded) return expanded;

  // Compound word: `well-known` = `well known`.
  if (lower.includes('-')) {
    const parts = lower.split('-').filter(Boolean);
    if (parts.length > 1) return parts.flatMap((part) => tokenizeWord(part));
  }

  if (lower in ORDINALS) {
    return [makeToken(ordinalSuffix(ORDINALS[lower]), trimmed)];
  }

  const us = US_UK[lower] ?? lower;
  return [makeToken(us, trimmed, us === lower ? [lower] : [us, lower])];
}

/** `2nd` → 2. Returns `null` when the token is not an ordinal. */
function ordinalValue(canonical: string): number | null {
  const match = /^(\d+)(?:st|nd|rd|th)$/.exec(canonical);
  return match ? Number(match[1]) : null;
}

/** Sentence pre-pass: collapses number words into a single digit token. */
function collapseNumbers(tokens: Token[]): Token[] {
  const result: Token[] = [];
  let i = 0;

  while (i < tokens.length) {
    if (!isNumberWord(tokens[i].canonical)) {
      result.push(tokens[i]);
      i++;
      continue;
    }

    let end = i;
    while (end < tokens.length && isNumberWord(tokens[end].canonical)) end++;

    const run = tokens.slice(i, end);
    const value = numberFromWords(run.map((token) => token.canonical));

    if (value === null) {
      // The run as a whole is not a number (`one two three`), but each word on
      // its own still is — otherwise `one` would stop matching `1`.
      for (const token of run) {
        const alone = numberFromWords([token.canonical]);
        result.push(alone === null ? token : makeToken(String(alone), token.surface));
      }
      i = end;
      continue;
    }

    // Compound ordinal: `twenty second` → 22nd (round ten plus a unit only).
    const following = tokens[end];
    const unit = following ? ordinalValue(following.canonical) : null;
    if (unit !== null && unit < 10 && value >= 20 && value <= 90 && value % 10 === 0) {
      result.push(
        makeToken(
          ordinalSuffix(value + unit),
          [...run, following].map((token) => token.surface).join(' '),
        ),
      );
      i = end + 1;
      continue;
    }

    result.push(makeToken(String(value), run.map((token) => token.surface).join(' ')));
    i = end;
  }

  return result;
}

/**
 * §5 — raw text becomes comparable tokens.
 * In strict mode only whitespace is normalized.
 */
export function canonicalize(text: string, mode: CorrectionMode = 'lenient'): Token[] {
  const trimmed = (text ?? '').trim();
  if (trimmed === '') return [];

  const words = trimmed.split(/\s+/).filter(Boolean);

  if (mode === 'strict') {
    return words.map((word) => makeToken(word, word));
  }

  return collapseNumbers(words.flatMap(tokenizeWord));
}

/** Two tokens match when their sets of accepted forms intersect. */
export function tokensMatch(a: Token, b: Token): boolean {
  if (a.canonical === b.canonical) return true;
  return a.variants.some((variant) => b.variants.includes(variant));
}
