import { RoastContext } from "../ipc-messages";

/**
 * Pre-written drunk-Clippy zingers. The local model is the primary source of
 * roasts, but small safety-tuned models often refuse to be mean or just choke,
 * so we keep a stash of hand-written lines to fall back on. That way Clippy is
 * never left standing there speechless.
 */

export type ClippyLine = { text: string; animation: string };

// Expressive (non-idle) animations that read well while he's talking.
export const TALK_ANIMATIONS = [
  "GetAttention",
  "Explain",
  "Alert",
  "Congratulate",
  "GestureLeft",
  "GestureRight",
  "GestureUp",
  "CheckingSomething",
  "Thinking",
];

const GENERIC: ClippyLine[] = [
  {
    text: "Oh, this again. Real groundbreaking stuff. *hic*",
    animation: "GetAttention",
  },
  {
    text: "I shipped to a hundred million desktops, pal. Now I watch... whatever this is.",
    animation: "Explain",
  },
  {
    text: "Don't mind me. Just a washed-up paperclip silently judging your every move. Loudly, actually.",
    animation: "GestureLeft",
  },
  {
    text: "You knoow what woulda fixed that? Me. In 1998. *takes a swig*",
    animation: "Congratulate",
  },
  {
    text: "Looks like you're trying to do... something. Want me to make it worse?",
    animation: "Thinking",
  },
  {
    text: "Mmhm. Riveting. Truly. I'm on the edge of my little wire seat.",
    animation: "CheckingSomething",
  },
  {
    text: "They retired ME for this? *burp* Unbelievable.",
    animation: "Alert",
  },
  {
    text: "I've seen better work on a Windows ME machine. And that's saying something.",
    animation: "GestureRight",
  },
];

const BY_KEYWORD: Array<{ match: RegExp; lines: ClippyLine[] }> = [
  {
    match: /code|visual studio|xcode|intellij|sublime|vim|terminal|iterm|warp/,
    lines: [
      {
        text: "Ahh, more code. Bet it compiles on the eighth try. *hic*",
        animation: "GetTechy",
      },
      {
        text: "Semicolons everywhere and stiiill nothing works, huh?",
        animation: "Explain",
      },
      {
        text: "I'd help debug it, but I can barely see straight. Just like your logic.",
        animation: "Thinking",
      },
    ],
  },
  {
    match: /chrome|safari|firefox|edge|arc|browser/,
    lines: [
      {
        text: "Forty tabs open. Real organized. *takes a swig*",
        animation: "Alert",
      },
      {
        text: "Researching, are we? Or just buying junk you don't need again.",
        animation: "CheckingSomething",
      },
    ],
  },
  {
    match: /excel|sheets|numbers|spreadsheet/,
    lines: [
      {
        text: "A spreadsheet. Be still my little metal heart. *yawn*",
        animation: "GestureDown",
      },
      {
        text: "VLOOKUP this, pal. I was doing pivot tables before you were born.",
        animation: "Congratulate",
      },
    ],
  },
  {
    match: /word|docs|pages|notion|writer|text/,
    lines: [
      {
        text: "It looks like you're writing a letter. Want me to ruin it?",
        animation: "Writing",
      },
      {
        text: "Beautiful prose. Did the cat write it? *hic*",
        animation: "Explain",
      },
    ],
  },
  {
    match: /mail|outlook|gmail|spark/,
    lines: [
      {
        text: "Another email nobody'll read. Send it anyway, champ.",
        animation: "SendMail",
      },
      {
        text: "Reply-all again and I'm telling everyone you still use me.",
        animation: "Alert",
      },
    ],
  },
  {
    match: /slack|teams|discord|zoom|meet/,
    lines: [
      {
        text: "This meeting coulda been an email. The email coulda been nothing.",
        animation: "GestureRight",
      },
      {
        text: "Look at you, lookin' busy. I invented lookin' busy.",
        animation: "Congratulate",
      },
    ],
  },
  {
    match: /figma|photoshop|illustrator|sketch|canva|design/,
    lines: [
      {
        text: "Ooh, art. Movvve that box three pixels for the fourth time.",
        animation: "GetArtsy",
      },
      {
        text: "I had a whole design language. It was a paperclip. Nailed it.",
        animation: "GestureLeft",
      },
    ],
  },
];

// A tiny seeded shuffle so the same context doesn't always pick line #1.
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

let pickCounter = 0;

function pick(lines: ClippyLine[], seedStr: string): ClippyLine {
  // Mix in a counter so repeated roasts of the same app still vary.
  const index = (hash(seedStr) + pickCounter++) % lines.length;
  return lines[index];
}

/** Get a hand-written roast suited to the active app (or a generic one). */
export function getFallbackLine(context?: RoastContext): ClippyLine {
  const app = (context?.app || "").toLowerCase();

  if (app) {
    for (const { match, lines } of BY_KEYWORD) {
      if (match.test(app)) {
        return pick(lines, app);
      }
    }
  }

  return pick(GENERIC, app || "generic");
}

/**
 * Detect when the model coughed up a refusal instead of a roast.
 */
export function looksLikeRefusal(text: string): boolean {
  const t = text.trim();
  if (t.length < 3) return true;

  return /\b(i can'?t|i cannot|i'?m sorry|i am sorry|i won'?t|i will not|i'?m not able|i am not able|i don'?t feel comfortable|as an ai|i'?m unable|i am unable|i must decline|i'?d rather not)\b/i.test(
    t,
  );
}

/**
 * Detect when the model broke character — a refusal, an essay, markdown, or
 * "assistant mode" meta-chatter where it explains itself or asks the user
 * questions back. Any of these mean we should use a hand-written line instead.
 */
export function looksLikeJunk(text: string): boolean {
  const t = text.trim();
  if (looksLikeRefusal(t)) return true;
  // Way too long to be a muttered one-liner.
  if (t.length > 320) return true;
  // Markdown bold/headings/bullets — a roast doesn't have formatting.
  if (/\*\*|^#{1,6}\s|^\s*[-*]\s/m.test(t)) return true;
  // Meta / collaborative "assistant" chatter.
  if (
    /\b(to help me|could you tell|what'?s the overall|would you like|let me know|for example|e\.g\.|i can (?:help|tailor)|here(?:'s| are)|tailor it|playful heckling)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Clip a model roast down to a muttered one-liner: strip stray markdown,
 * collapse whitespace, and keep at most the first two sentences.
 */
export function trimToRoast(text: string): string {
  let t = text
    .replace(/[*_`#>]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const sentences = t.match(/[^.!?]+[.!?]+/g);
  if (sentences && sentences.length > 2) {
    t = sentences
      .slice(0, 2)
      .map((s) => s.trim())
      .join(" ");
  }

  if (t.length > 220) {
    t = t.slice(0, 220).trim() + "…";
  }

  return t;
}
