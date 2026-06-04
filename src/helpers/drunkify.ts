/**
 * Garnish text so it reads like it was typed by a drunk, washed-up paperclip.
 *
 * The model already writes in a slurred, bitter voice (see DRUNK_PERSONA); this
 * is a deterministic post-process that adds consistent slurring, stretched
 * vowels, and the occasional hiccup on top. It is seeded from the input string
 * so the same text always produces the same output — no flicker on re-render,
 * and easy to unit test.
 */

const HICCUPS = ["*hic*", "*burp*", "*takes a swig*", "*hic*"];

// FNV-1a hash → 32-bit seed.
function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// mulberry32 PRNG — tiny, deterministic, good enough for jokes.
function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param text      The clean text to slur.
 * @param intensity 0 = sober (no change), 1 = falling-down drunk. Default 0.35
 *                  — tipsy, not sloppy; the bite should read through, not mush.
 */
export function drunkify(text: string, intensity = 0.35): string {
  if (!text || intensity <= 0) return text;

  const rng = mulberry32(hashSeed(text));
  const chance = (p: number) => rng() < p * intensity;

  // Split into words + whitespace tokens so spacing is preserved.
  const tokens = text.split(/(\s+)/);
  let slurCount = 0;
  const slurred = tokens.map((tok) => {
    if (/^\s*$/.test(tok) || tok.length < 3) return tok;

    let w = tok;
    // "s" → "sh": jusht the besht.
    if (chance(0.3)) {
      w = w.replace(/s/, (m) => (m === "S" ? "Sh" : "sh"));
    }
    // Stretch a vowel a touch: reaally (doubled, not tripled — subtler).
    if (chance(0.28)) {
      w = w.replace(/[aeiou]/i, (m) => m + m);
    }
    if (w !== tok) slurCount++;
    return w;
  });

  // If the seed rolled unlucky and nothing slurred, force one stretch on the
  // longest word so every line still reads at least a little drunk.
  if (slurCount === 0) {
    let longest = -1;
    let longestLen = 2;
    slurred.forEach((tok, i) => {
      if (!/^\s*$/.test(tok) && tok.length > longestLen) {
        longestLen = tok.length;
        longest = i;
      }
    });
    if (longest >= 0) {
      slurred[longest] = slurred[longest].replace(/[aeiou]/i, (m) => m + m);
    }
  }

  let result = slurred.join("");

  // Slur some sentence endings into a trailing-off "..." and sprinkle hiccups.
  result = result.replace(/([.!?])(\s|$)/g, (match, _punct, trailing) => {
    if (!chance(0.45)) return match;
    const hic = chance(0.5)
      ? " " + HICCUPS[Math.floor(rng() * HICCUPS.length)]
      : "";
    return "..." + hic + (trailing || " ");
  });

  return result.trimEnd();
}
