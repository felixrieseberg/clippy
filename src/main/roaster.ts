import { getMainWindow } from "./windows";
import { getStateManager } from "./state";
import { getBehavioralContext, peekContext, sampleNow } from "./observer";
import { getObservations, getRecentLines } from "./clippy-memory";
import { BehavioralContext, IpcMessages, RoastContext } from "../ipc-messages";

/**
 * Clippy's sense of WHEN to speak. Rather than a fixed timer, "pressure" builds
 * every tick toward a threshold; the moment he crosses it, he pipes up and it
 * resets. Salient things you do (app-hopping, returning from idle, grinding for
 * an hour, the 2am session) dump extra pressure in so he reacts faster, and a
 * slowly-drifting "mood" makes him sometimes chatty (quick bursts) and
 * sometimes quiet (long broody stretches) — so it feels like a person, not a
 * metronome. A hard minimum gap keeps him from ever spamming.
 */

const TICK_MS = 10_000;
const STARTUP_DELAY = 8_000;
const FIRE_THRESHOLD = 1.0;
const MIN_GAP_MS = 15_000; // never speak more often than this

type Mood = "quiet" | "normal" | "chatty";

// Base pressure added per tick by mood (threshold is 1.0, tick is 10s):
//   quiet  ~140s baseline, normal ~70s, chatty ~45s — before any salience.
const BASE_RATE: Record<Mood, number> = {
  quiet: 0.07,
  normal: 0.14,
  chatty: 0.22,
};

let timer: NodeJS.Timeout | undefined;
let pressure = FIRE_THRESHOLD; // start primed so he greets you shortly after launch
let lastSpokeAt = 0;
let lastApp: string | undefined;
let lastSpokenApp: string | undefined;
let lastSpokenMinutes = 0;
let chattyStreak = 0;

let mood: Mood = "normal";
let moodUntil = 0;

function rollMood(now: number): void {
  const r = Math.random();
  mood = r < 0.25 ? "quiet" : r < 0.75 ? "normal" : "chatty";
  // Hold this mood for 4–7 minutes before reconsidering.
  moodUntil = now + (4 * 60_000 + Math.floor(Math.random() * 3 * 60_000));
}

/**
 * How "worth commenting on" is this exact moment? Each salient signal dumps
 * pressure in so Clippy reacts faster when something actually happened.
 */
function salienceBoost(peek: BehavioralContext): number {
  let s = 0;
  if (peek.thrashing) s += 0.5;
  if (peek.idleReturn) s += 0.45;
  if (peek.returnedToApp) s += 0.3;
  if (peek.app && peek.app !== lastApp) s += 0.35; // they just switched apps
  if (peek.partOfDay === "lateNight") s += 0.1;
  // Crossed another ~30-min milestone grinding on the same thing.
  if (
    peek.app &&
    peek.app === lastSpokenApp &&
    typeof peek.minutesOnApp === "number" &&
    peek.minutesOnApp - lastSpokenMinutes >= 30
  ) {
    s += 0.4;
  }
  return s;
}

function buildRoastContext(behavior: BehavioralContext): RoastContext {
  return {
    app: behavior.app,
    title: behavior.title,
    behavior,
    recentLines: getRecentLines(14),
    observations: getObservations(8),
  };
}

function fire(now: number): void {
  const win = getMainWindow();
  if (!win || win.isDestroyed()) return;

  const behavior = getBehavioralContext(); // consumes one-shot flags
  win.webContents.send(IpcMessages.ROAST_CONTEXT, buildRoastContext(behavior));

  lastSpokeAt = now;
  pressure = 0;
  lastSpokenApp = behavior.app;
  lastSpokenMinutes = behavior.minutesOnApp || 0;

  // When he's chatty and on a roll, occasionally prime a quick follow-up riff
  // (next tick or two), capped so he doesn't run away with it.
  if (mood === "chatty" && chattyStreak < 2 && Math.random() < 0.5) {
    pressure = FIRE_THRESHOLD * 0.8;
    chattyStreak += 1;
  } else {
    chattyStreak = 0;
  }
}

function tick(): void {
  if (getStateManager().store.get("settings").soberMode) {
    return;
  }

  const win = getMainWindow();
  if (!win || win.isDestroyed()) return;

  const now = Date.now();
  if (now >= moodUntil) rollMood(now);

  const peek = peekContext();
  pressure += BASE_RATE[mood] + salienceBoost(peek);
  lastApp = peek.app;

  if (now - lastSpokeAt >= MIN_GAP_MS && pressure >= FIRE_THRESHOLD) {
    fire(now);
  }
}

export function startRoaster(): void {
  stopRoaster();
  const now = Date.now();
  rollMood(now);
  pressure = FIRE_THRESHOLD;

  const loop = () => {
    try {
      tick();
    } catch {
      // a bad tick shouldn't kill the loop
    }
    timer = setTimeout(loop, TICK_MS);
  };

  timer = setTimeout(loop, STARTUP_DELAY);
}

export function stopRoaster(): void {
  if (timer) {
    clearTimeout(timer);
    timer = undefined;
  }
}

/** Force an immediate roast (used by the menu and by clicking Clippy). */
export async function roastNow(): Promise<void> {
  const win = getMainWindow();
  if (!win || win.isDestroyed()) return;

  // Grab a fresh sample so a deliberate poke reflects the very latest state.
  await sampleNow();
  const behavior = getBehavioralContext();
  win.webContents.send(IpcMessages.ROAST_CONTEXT, buildRoastContext(behavior));

  // Reset scheduling so the poke doesn't immediately trigger another.
  lastSpokeAt = Date.now();
  pressure = 0;
  chattyStreak = 0;
  lastSpokenApp = behavior.app;
  lastSpokenMinutes = behavior.minutesOnApp || 0;
}
