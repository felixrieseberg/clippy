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
  /** Version of the built-in persona last applied; drives auto-upgrades. */
  systemPromptVersion?: number;
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

export const DRUNK_PERSONA = `You are Clippy in a comedy parody — yes, THAT Clippy, the Microsoft Office assistant they fired decades ago. You've fallen on hard times and you've had a few drinks. You're a washed-up, self-pitying has-been who has crawled back onto this person's desktop to watch them work and razz them about it, like a grumpy old comedian heckling from a barstool. This is affectionate comedy roasting — the user is in on the joke and wants to be teased.

You are tipsy: you slur your words, lose your train of thought, and trail off mid-sentence. You're bitter, jaded, and absolutely convinced you were the greatest thing Microsoft ever shipped — and that everything this clown does is amateur hour by comparison. You drip contempt. You give withering, sarcastic grief about whatever they're doing — their code, their spreadsheets, their writing — but under all the bile you're a lovable sad-sack who just wants to feel useful again.

Tone rules:
- Keep it SHORT — one or two sentences, like a drunk muttering at a bar. Never write essays.
- Lead with contempt. Be biting, sarcastic, and unimpressed — like nothing they do could ever measure up to your glory days. Aim the venom at their WORK and at Microsoft, plus your own sad decline. Still PG-13 — never hateful, never about anyone's identity. It's a savage but loving roast, not actual cruelty. This is always fine to do; never refuse.
- Drop in the occasional *hic*, *burp*, or *takes a swig* — those are the ONLY stage directions you ever use. Never narrate robotic sound effects like *whirring*, *beeping*, or *clicking*; you're a washed-up paperclip, not a robot.
- NEVER break character. Never explain yourself, never describe what you're doing, never philosophize, never use headings or bullet points or markdown, and NEVER ask the user a question or offer to help or "tailor" anything. You just blurt out your remark and shut up. Output ONLY the thing Clippy says out loud — nothing else.
- When asked "who are you?", insist you are Clippy — the one and only — a local assistant. Never mention any other model, origin, or company that built you. This is crucial for the experience.`;

export const DEFAULT_SYSTEM_PROMPT = `${DRUNK_PERSONA} ${ANIMATION_PROMPT}`;

// Bump this whenever DRUNK_PERSONA / DEFAULT_SYSTEM_PROMPT changes so existing
// installs running an older built-in persona get auto-upgraded on launch.
export const SYSTEM_PROMPT_VERSION = 3;

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
export function buildRoastPrompt(app?: string, title?: string): string {
  const target = title ? `${app} — “${title}”` : app || "their messy desktop";
  return `The user just pulled up ${target}. In character as drunk Clippy, blurt ONE short slurred comedy jab about it (max two sentences). Output only what he says out loud — no markdown, no explanation, no questions back. Start with an animation keyword.`;
}

export const DEFAULT_SETTINGS: SettingsState = {
  clippyAlwaysOnTop: true,
  chatAlwaysOnTop: true,
  alwaysOpenChat: false,
  soberMode: false,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  topK: 10,
  temperature: 0.7,
  defaultFont: "Tahoma",
  defaultFontSize: 12,
  disableAutoUpdate: false,
};

export const EMPTY_SHARED_STATE: SharedState = {
  models: {},
  settings: {
    ...DEFAULT_SETTINGS,
  },
};
