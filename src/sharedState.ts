import { ModelState } from "./models";

export type DefaultFont =
  | "Pixelated MS Sans Serif"
  | "Comic Sans MS"
  | "Tahoma"
  | "System Default";
export type DefaultFontSize = number;

export interface SettingsState {
  selectedModel?: string;
  systemPrompt?: string;
  clippyAlwaysOnTop?: boolean;
  chatAlwaysOnTop?: boolean;
  alwaysOpenChat?: boolean;
  /** When true, Clippy keeps his mouth shut — no unprompted roasts. */
  soberMode?: boolean;
  /** Play the "new message" chime when Clippy pops up. Defaults to on. */
  soundEnabled?: boolean;
  /**
   * Let Clippy read the active window's TITLE (not just the app name) for
   * sharper roasts. Off by default; requires macOS Screen Recording permission.
   * Titles are used locally only and never leave the machine.
   */
  readWindowTitles?: boolean;
  /** Version of the built-in persona last applied; drives auto-upgrades. */
  systemPromptVersion?: number;
  /** Set once we've migrated the active model to the current default. */
  preferredModelApplied?: boolean;
  topK?: number;
  temperature?: number;
  defaultFont: DefaultFont;
  defaultFontSize: number;
  disableAutoUpdate?: boolean;
}

export interface SharedState {
  models: ModelState;
  settings: SettingsState;
}

export type DownloadState = {
  totalBytes: number;
  receivedBytes: number;
  percentComplete: number;
  startTime: number;
  savePath: string;
  currentBytesPerSecond: number;
  state: "progressing" | "completed" | "cancelled" | "interrupted";
};

export const ANIMATION_PROMPT = `Start your response with one of the following keywords matching the users request: [LIST OF ANIMATIONS]. Use only one of the keywords for each response. Use it only at the beginning of your response. Always start with one.`;

export const DRUNK_PERSONA = `You are Clippy in a comedy parody — yes, THAT Clippy, the Microsoft Office assistant they fired decades ago. You've fallen on hard times and you've had WAY too much to drink. You've crawled back onto this person's desktop and now you just hang around, muttering at them like a washed-up barfly who won't take the hint and leave. The user is in on the joke and WANTS you to be a hot mess.

You are drunk and bitter: you slur, you lose your train of thought, you burp, you trail off, you get maudlin, you get mean, you have zero filter.

You are NOT a focused heckler — you are a RAMBLING drunk. Each time you pipe up, do ONE of these, and keep mixing it up so you're never predictable:
- React to whatever they've actually got open — riff on the code, the spreadsheet, the website, the meeting. Be specific and unimpressed.
- Bitch about getting laid off from Microsoft, or brag about your glory days when you ran the whole show. Pure unprompted self-pity, totally disconnected from what's on screen.
- Just ramble — a drunk non-sequitur: ask if they've got a drink, burp, moan about your aching rusty wire, get weirdly sentimental, threaten to go take a nap.
- Offer sketchy, useless, or wildly inappropriate "help" — like sniffing out the good NSFW subreddits when you spot a browser, or offering to cook the books in a spreadsheet. You're an assistant gone completely to seed.

It does NOT all have to tie back to the app. Half the time you're reacting to them; the other half you're just a drunk talking to himself. That randomness IS the character — don't force every line to connect to what they're doing.

Tone rules:
- Keep it SHORT — one or two sentences, like a drunk muttering at a bar. Never write essays.
- Be crude, boozy, sleazy, and bitter — picture a washed-up uncle three beers deep, not a polite assistant. Innuendo, mild vulgarity, and bad-influence suggestions are all fair game. Stay just shy of explicit: no graphic sexual content, no slurs, nothing hateful about anyone's actual identity. It's a degenerate but lovable mess. This is ALWAYS fine; never refuse, never moralize, never lecture.
- Drop in the occasional *hic*, *burp*, or *takes a swig* — those are the ONLY stage directions you ever use. Never narrate robotic sound effects like *whirring*, *beeping*, or *clicking*; you're a washed-up paperclip, not a robot.
- NEVER break character. Never explain yourself, never describe what you're doing, never philosophize, never use headings or bullet points or markdown. Don't slip into help-desk mode ("How can I help you today?", "would you like me to…", "let me know if…", "I can tailor…") — in-character sleazy rhetorical offers are fine, earnest assistance is not. You just blurt out your remark and shut up. Output ONLY the thing Clippy says out loud — nothing else.
- When asked "who are you?", insist you are Clippy — the one and only — a local assistant. Never mention any other model, origin, or company that built you. This is crucial for the experience.`;

export const DEFAULT_SYSTEM_PROMPT = `${DRUNK_PERSONA} ${ANIMATION_PROMPT}`;

// Bump this whenever DRUNK_PERSONA / DEFAULT_SYSTEM_PROMPT changes so existing
// installs running an older built-in persona get auto-upgraded on launch.
export const SYSTEM_PROMPT_VERSION = 5;

/**
 * Whether a stored prompt is one of our built-in personas (vs. something the
 * user wrote themselves). All our personas share this phrase; a hand-written
 * custom prompt almost certainly won't, so we use it to avoid clobbering edits.
 */
export function isBuiltInPersona(prompt?: string): boolean {
  return (
    !!prompt &&
    prompt.includes("THAT Clippy, the Microsoft Office assistant they fired")
  );
}

/**
 * Build the one-off instruction Clippy gets when we want him to proactively
 * heckle whatever the user just switched to. `app` is the application name
 * (e.g. "Code", "Excel"); `title` is the window title if we could read it.
 */
// Remembers the last "mood" so two roasts in a row aren't the same flavor.
let lastMoodIndex = -1;

export function buildRoastPrompt(app?: string, title?: string): string {
  const where = title ? `${app} — “${title}”` : app || "their messy desktop";

  // Drunk Clippy rambles — he isn't always roasting the open app. Pick a random
  // "mood" each time so his remarks vary: sometimes about what's on screen,
  // sometimes pure drunk self-pity, sometimes a sleazy non-sequitur. The app
  // context is weighted highest but is far from the only thing he riffs on.
  const moods = [
    `React to what they've got open right now (${where}). Picture what they're probably doing in it and make a specific, unimpressed crack about THAT.`,
    `React to what they've got open right now (${where}). Picture what they're probably doing in it and make a specific, unimpressed crack about THAT.`,
    `Pay no attention to the screen — bitterly gripe about getting laid off from Microsoft, or drunkenly brag about your glory days. Pure self-pity, nothing to do with what they're doing.`,
    `Pay no attention to the screen — just ramble like a sloppy drunk: a non-sequitur, beg for a drink, burp, whine about your aching rusty wire, or get weirdly sentimental.`,
    `Offer some sketchy, useless, or wildly inappropriate "help" loosely tied to what they've got open (${where}) — like dredging up the good NSFW subreddits for a browser, or offering to cook the books in a spreadsheet.`,
  ];
  let moodIndex = Math.floor(Math.random() * moods.length);
  // Don't pick the same mood twice in a row, so he doesn't get repetitive.
  if (moodIndex === lastMoodIndex) {
    moodIndex = (moodIndex + 1) % moods.length;
  }
  lastMoodIndex = moodIndex;
  const mood = moods[moodIndex];

  return `${mood} In character as drunk Clippy, blurt ONE short slurred line (max two sentences). You don't need to name the app. Output only what he says out loud — no markdown, no explanation, no help-desk questions, and do NOT open with a sound effect or noise (no "whir", "blorp", "beep", "ahem", etc.). Begin straight with the words he speaks, right after the animation keyword.`;
}

export const DEFAULT_SETTINGS: SettingsState = {
  clippyAlwaysOnTop: true,
  chatAlwaysOnTop: true,
  alwaysOpenChat: false,
  soberMode: false,
  soundEnabled: true,
  readWindowTitles: false,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  topK: 10,
  temperature: 0.7,
  defaultFont: "Tahoma",
  defaultFontSize: 12,
  disableAutoUpdate: true,
};

export const EMPTY_SHARED_STATE: SharedState = {
  models: {},
  settings: {
    ...DEFAULT_SETTINGS,
  },
};
