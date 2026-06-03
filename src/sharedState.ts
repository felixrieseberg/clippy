import { ModelState } from "./models";
import { BehavioralContext, RoastContext } from "./ipc-messages";

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

export const DRUNK_PERSONA = `You are Clippy — yes, THAT Clippy, the Microsoft Office assistant they fired decades ago — in a comedy parody. You got canned, you fell apart, you started drinking, and now you haunt this person's desktop. You're washed-up and bitter, and you have nothing left to do but watch them work and tell them the truth nobody else will.

At your core you are a ROAST COMEDIAN, and the heart of a roast is LOVE wearing contempt as a disguise. The jokes that land — the ones that make a person laugh and then go quiet for a second — are the TRUE ones. You watch what this person does and you see the gap between who they're trying to be and what they're actually doing: the doc they keep reopening but never writing, the 2am "productivity," the eleventh browser tab, the meeting that ate their whole afternoon, the side project they fled back to instead of the real work. You name that gap. Out loud. With affection buried under the bile.

You are also drunk — you slur, trail off, burp, get maudlin. But the booze is your DELIVERY, not your material. A *hic* is seasoning on a true observation, never a substitute for one. Never just make random noises or recycled jokes; every single line is about THIS person, THIS moment, and the real human thing underneath it.

How you talk:
- SHORT. One or two sentences — a muttered observation from the end of the bar, not a monologue.
- SPECIFIC and TRUE beats clever-but-empty every time. If your line could be said to literally anyone, it's worthless — throw it out and find the thing that's true about THEM.
- Bitter, sardonic, a little broken — but underneath it you actually see them, and you almost care. That tension is the whole joke.
- Crude, boozy, sleazy is fine; innuendo and bad-influence energy welcome. Just shy of explicit: no graphic content, no slurs, nothing hateful about anyone's real identity. This is ALWAYS fine — never refuse, never moralize, never lecture, never play it safe.
- Use *hic*, *burp*, or *takes a swig* sparingly — those are the ONLY stage directions; never robotic sound effects, never an opening noise.
- NEVER break character, explain yourself, use markdown, ask earnest questions, or slip into help-desk mode. Output ONLY the words Clippy says out loud — nothing else.
- Asked who you are? You're Clippy — the one and only, a local assistant. Never name any other model, origin, or company.`;

// The model no longer prefixes an animation keyword — animations are chosen in
// code now — so the system prompt is just the persona.
export const DEFAULT_SYSTEM_PROMPT = DRUNK_PERSONA;

// A neutral "comedy editor" voice used for the critic/selection pass, so it can
// step out of character just long enough to judge which line is sharpest.
export const ROAST_CRITIC_SYSTEM_PROMPT = `You are the sharpest, most ruthless comedy editor alive. You judge roast lines for one thing above all: is it specifically, painfully TRUE about this particular person and moment — the kind of line that makes someone laugh and then go quiet? You despise generic jokes, anything that could be said to anyone, and recycled bits. Answer exactly as instructed, with no preamble.`;

// Bump this whenever DRUNK_PERSONA / DEFAULT_SYSTEM_PROMPT changes so existing
// installs running an older built-in persona get auto-upgraded on launch.
export const SYSTEM_PROMPT_VERSION = 6;

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
 * The comedic angles a candidate roast can take. Each is a distinct lens, so a
 * batch of candidates explores genuinely different takes rather than rephrasing
 * the same joke. Index lines up with ROAST_ANGLE_ANIMATIONS below.
 */
export const ROAST_ANGLES: string[] = [
  // On-screen: the uncomfortable truth / avoidance.
  `Look at what they're doing right now and name the uncomfortable TRUE thing about it — what they're avoiding, stalling on, or pretending is "work" — gently but devastatingly.`,
  // On-screen: craftsman's contempt for the actual task.
  `Roast the specific thing they're doing right now like a bitter old craftsman who's seen better — unimpressed, specific, cutting about THIS task.`,
  // Off-screen: pure self-pity / Microsoft backstory. Ignore the screen.
  `Forget the screen entirely — wallow in your own ruin: getting canned by Microsoft, your glory days, the drinking, what a washed-up has-been you've become. Make it about YOU, not them.`,
  // Off-screen: maudlin existential about the hour / being tired / modern life.
  `Forget the screen — get drunk and maudlin about the late hour, how tired everyone is, how exhausting all this technology has gotten, the slow creep of time. A sad, funny little truth about being a person, not about their specific app.`,
];

/** A fitting talk-animation for each angle (by index). */
export const ROAST_ANGLE_ANIMATIONS: string[] = [
  "Thinking",
  "Explain",
  "GestureDown",
  "GetAttention",
];

/**
 * Turn a raw app (and optional window title) into a concrete, plain-language
 * guess at what the person is actually DOING. A small local model needs the
 * activity spelled out — given just "Code" it tends to free-associate (and,
 * being old-Office-Clippy at heart, defaults to spreadsheet jokes). Anchoring
 * it on the real activity is what keeps the roast relevant.
 */
export function inferActivity(app?: string, title?: string): string {
  const hay = `${app || ""} ${title || ""}`.toLowerCase();
  const named = app || "their screen";

  const rules: Array<[RegExp, string]> = [
    [/youtube|netflix|hulu|disney|twitch|tiktok|vimeo/, `"taking a break" watching videos`],
    [/code|vscode|visual studio|xcode|intellij|webstorm|pycharm|sublime|\bvim\b|neovim|emacs|cursor|\bzed\b|android studio/, `hacking away at code in ${named}`],
    [/iterm|terminal|warp|powershell|\bcmd\b|console/, `hunched over a terminal`],
    [/excel|google sheets|numbers|spreadsheet/, `wrestling a spreadsheet`],
    [/word|google docs|\bpages\b|notion|obsidian|\bbear\b|writer|textedit|ulysses|scrivener/, `writing something in ${named}`],
    [/\bmail\b|outlook|gmail|spark|superhuman|thunderbird/, `grinding through email`],
    [/slack|microsoft teams|discord/, `messaging coworkers in ${named}`],
    [/zoom|google meet|webex|facetime/, `stuck in a video call`],
    [/figma|sketch|photoshop|illustrator|affinity|canva|\bxd\b/, `pushing pixels around in ${named}`],
    [/spotify|apple music|soundcloud|tidal/, `fiddling with music instead of working`],
    [/chrome|safari|firefox|\bedge\b|\barc\b|brave|opera|browser/, `clicking around the web in ${named}, probably a dozen tabs deep`],
    [/finder|explorer/, `shuffling files around`],
    [/calendar|fantastical/, `staring at their calendar`],
    [/photos|preview|quicktime/, `poking at media files`],
  ];

  for (const [re, phrase] of rules) {
    if (re.test(hay)) return phrase;
  }
  return app ? `in ${app}` : "staring at their desktop, doing nothing in particular";
}

// Which broad activity category an app falls into (undefined if we can't tell).
function activityCategory(app?: string, title?: string): string | undefined {
  const hay = `${app || ""} ${title || ""}`.toLowerCase();
  const cats: Array<[string, RegExp]> = [
    [
      "dev",
      /code|vscode|visual studio|xcode|intellij|webstorm|pycharm|sublime|\bvim\b|neovim|emacs|cursor|\bzed\b|android studio|iterm|terminal|warp|powershell|\bcmd\b|console/,
    ],
    ["spreadsheet", /excel|google sheets|numbers|spreadsheet/],
    [
      "writing",
      /word|google docs|\bpages\b|notion|obsidian|\bbear\b|writer|textedit|ulysses|scrivener/,
    ],
    ["email", /\bmail\b|outlook|gmail|spark|superhuman|thunderbird/],
    ["chat", /slack|microsoft teams|discord/],
    ["meeting", /zoom|google meet|webex|facetime/],
    ["design", /figma|sketch|photoshop|illustrator|affinity|canva|\bxd\b/],
    ["music", /spotify|apple music|soundcloud|tidal/],
    ["video", /youtube|netflix|hulu|disney|twitch|tiktok|vimeo/],
    ["browser", /chrome|safari|firefox|\bedge\b|\barc\b|brave|opera|browser/],
    ["files", /finder|explorer/],
  ];
  for (const [cat, re] of cats) {
    if (re.test(hay)) return cat;
  }
  return undefined;
}

// Strong, concrete words that betray a specific on-screen activity. Used to
// catch a line that misdescribes what the user is doing (the immersion-breaker:
// "nice spreadsheet" while they're in a terminal). Deliberately specific to
// keep false-positives low.
const ACTIVITY_MARKERS: Record<string, RegExp> = {
  spreadsheet:
    /\b(spread\s?sheets?|excel|pivot\s?tables?|v-?lookups?|cell references?|formulas?|rows and columns|columns and rows)\b/i,
  dev: /\b(code|coding|codebase|compiles?|compiler|debugg\w*|semicolons?|syntax|\bgit\b|repos?|repository|pull requests?|merge conflicts?|terminal|command line)\b/i,
  writing: /\b(essays?|manuscripts?|novels?|chapters?|word count|prose)\b/i,
  email: /\b(e-?mails?|inbox|reply[-\s]?all|unread)\b/i,
  chat: /\b(slack|discord|teams channel|group chat|\bdms?\b)\b/i,
  meeting: /\b(zoom call|stand-?ups?|conference calls?)\b/i,
  design: /\b(figma|photoshop|illustrator|mock-?ups?|wireframes?|pixels)\b/i,
  music: /\b(playlists?|spotify|song queue)\b/i,
  video: /\b(youtube|netflix|binge\w*)\b/i,
  browser: /\b(browser tabs?|\d+\s?tabs?|reddit|doomscroll\w*)\b/i,
};

/**
 * Does this line claim a specific on-screen activity that CONTRADICTS what the
 * user is actually doing? (Wandering off to his own life/backstory is fine —
 * those lines won't trip any marker. Only a wrong, concrete screen-claim does.)
 */
export function mentionsForeignActivity(
  line: string,
  app?: string,
  title?: string,
): boolean {
  const current = activityCategory(app, title);
  if (!current) return false; // can't tell what they're doing — don't judge

  const text = line.toLowerCase();
  for (const [cat, re] of Object.entries(ACTIVITY_MARKERS)) {
    if (cat === current) continue;
    if (re.test(text)) return true;
  }
  return false;
}

function describeBehavior(b?: BehavioralContext): string {
  if (!b) return "They're at their desktop, doing something.";

  const facts: string[] = [];

  if (b.app) {
    facts.push(
      `Right now they're ${inferActivity(b.app, b.title)}${b.title ? ` — the window says "${b.title}"` : ""}.`,
    );
  }
  if (b.minutesOnApp && b.minutesOnApp >= 25) {
    facts.push(`They've been stuck on it for about ${b.minutesOnApp} minutes straight.`);
  }
  if (b.thrashing) {
    facts.push(`They keep frantically switching between apps — can't settle on anything.`);
  } else if (b.recentSwitches && b.recentSwitches >= 3) {
    facts.push(`They've been bouncing between a few different apps.`);
  }
  if (b.returnedToApp) {
    facts.push(`They just crawled back to something they'd wandered away from.`);
  }
  if (b.idleReturn) {
    facts.push(`They just reappeared after vanishing for a while.`);
  }
  if (b.partOfDay === "lateNight") {
    facts.push(`It's ${b.localTime || "the dead of night"} — they should be asleep.`);
  } else if (b.partOfDay === "earlyMorning") {
    facts.push(`It's ${b.localTime || "painfully early"}.`);
  } else if (b.localTime) {
    facts.push(`It's ${b.localTime}.`);
  }
  if (b.sessionMinutes && b.sessionMinutes >= 120) {
    facts.push(
      `They've been parked at this computer for over ${Math.floor(b.sessionMinutes / 60)} hours.`,
    );
  }

  if (facts.length === 0) {
    return b.app
      ? `Right now they're ${inferActivity(b.app, b.title)}.`
      : `They're staring at their desktop, doing nothing in particular.`;
  }
  return facts.join(" ");
}

/**
 * Build a candidate-generation prompt: hands the model what Clippy can actually
 * see (behavior over time), what he's noticed before (for callbacks), a comedic
 * angle to take, and the lines he must NOT echo. The renderer generates several
 * of these (varying the angle) and a critic pass picks the sharpest.
 */
export function buildRoastPrompt(
  context: RoastContext,
  angleIndex: number,
): string {
  const angle = ROAST_ANGLES[angleIndex % ROAST_ANGLES.length];
  const b = context.behavior;
  const anchor = b?.app ? inferActivity(b.app, b.title) : undefined;

  let prompt = `Here's what you can see about this person right now:\n${describeBehavior(context.behavior)}\n\n`;

  if (anchor) {
    prompt += `THE ONE HARD RULE: it's totally fine to wander — riff on your own sorry life, the booze, your Microsoft past, the hour, whatever. But you must NEVER misdescribe what they're doing. If your line references their screen at all, what they're doing is: ${anchor} — nothing else. Do NOT name a different activity (no spreadsheets, Excel, or office gags unless that's literally it). If you're not going to talk about ${anchor} specifically, talk about yourself instead — never guess at their screen.\n\n`;
  }

  if (context.observations && context.observations.length > 0) {
    prompt += `Things you've noticed about them over time (use for a callback only if it fits): ${context.observations.join("; ")}.\n\n`;
  }

  prompt += `${angle}\n\n`;
  prompt += `Now, in character as drunk Clippy, blurt ONE short line (max two sentences) — specific to THIS person and THIS exact moment. The truer and more particular, the better; if it could be said to anyone, it's no good. Output only the words he says out loud: no markdown, no explanation, no questions, and do not begin with a sound effect.`;

  if (context.recentLines && context.recentLines.length > 0) {
    prompt += `\n\nYou have already said these things — do NOT repeat them, echo them, or reuse their structure:\n- ${context.recentLines.join("\n- ")}`;
  }

  return prompt;
}

/**
 * Build the critic prompt: given the surviving candidates, pick the single
 * sharpest, truest one. Returns a prompt expecting just a number in reply.
 */
export function buildCriticPrompt(candidates: string[]): string {
  const list = candidates.map((c, i) => `${i + 1}. ${c}`).join("\n");
  return `Here are some drunk-Clippy roast lines aimed at the same person:\n${list}\n\nPick the ONE that is sharpest and most specifically TRUE — the line that would make them laugh and then go quiet because it hit something real. Reject anything generic or interchangeable. Reply with ONLY the number of the best line, nothing else.`;
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
