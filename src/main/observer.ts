import { powerMonitor } from "electron";
import { getStateManager } from "./state";
import { isIncognito, isSensitiveTitle, sanitizeTitle } from "./privacy";
import { recordActivity } from "./clippy-memory";
import { BehavioralContext, PartOfDay } from "../ipc-messages";

/**
 * Clippy's senses. Samples the foreground window every few seconds and builds a
 * lightweight model of what the user is *doing over time* — how long they've
 * been grinding, whether they're app-hopping, time of day, returns from idle —
 * so roasts can come from observed truth rather than a single snapshot.
 *
 * Everything is on-device. Sensitive/incognito windows are never recorded.
 */

const SAMPLE_INTERVAL = 5_000;
const IDLE_THRESHOLD_S = 90; // away this long counts as "gone"
const THRASH_WINDOW_MS = 5 * 60_000;
const THRASH_COUNT = 6; // app switches within the window = "thrashing"
// Enumerating ALL open windows is heavier than reading the active one, so do it
// only every Nth sample (~30s).
const OPEN_WINDOWS_EVERY = 6;

let sampleTimer: NodeJS.Timeout | undefined;

const sessionStart = Date.now();
let currentApp: string | undefined;
let currentTitle: string | undefined;
let appStartedAt = Date.now();
let lastWasIdle = false;
let switchTimes: number[] = [];
const seenApps = new Set<string>();
let pendingReturnedToApp = false;
let pendingIdleReturn = false;
let currentOpenApps: string[] = [];
let sampleCount = 0;
// Minutes-per-app accumulated since the last flush to persistent memory.
let pendingMinutes: Record<string, number> = {};
const FLUSH_EVERY = 12; // ~every 60s at the 5s sample rate

function flushPatterns(): void {
  const entries = Object.entries(pendingMinutes);
  if (entries.length === 0) return;
  for (const [app, minutes] of entries) {
    recordActivity(app, minutes);
  }
  pendingMinutes = {};
}

function isClippy(app?: string): boolean {
  return !!app && /clippy|electron/i.test(app);
}

/**
 * The distinct apps the user has open right now (names only — no titles, for
 * privacy). A read on who they are: their toolbelt and their distractions.
 */
async function sampleOpenWindows(): Promise<void> {
  try {
    const { openWindows } = await import("get-windows");
    const wins = await openWindows({
      screenRecordingPermission: false, // we only want app names, not titles
      accessibilityPermission: false,
    });
    const apps: string[] = [];
    const seen = new Set<string>();
    for (const w of wins) {
      const name = w.owner?.name;
      if (!name || isClippy(name) || seen.has(name)) continue;
      seen.add(name);
      apps.push(name);
      if (apps.length >= 12) break;
    }
    currentOpenApps = apps;
  } catch {
    // ignore — keep the last list
  }
}

async function readActiveWindow(): Promise<
  { app?: string; title?: string } | undefined
> {
  const { activeWindow } = await import("get-windows");
  const readTitles =
    getStateManager().store.get("settings").readWindowTitles === true;

  try {
    const win = await activeWindow({
      screenRecordingPermission: readTitles,
      accessibilityPermission: false,
    });
    if (!win) return undefined;
    return { app: win.owner?.name, title: readTitles ? win.title : undefined };
  } catch {
    // Title permission probably not granted — retry app-name-only.
    if (readTitles) {
      try {
        const win = await activeWindow({
          screenRecordingPermission: false,
          accessibilityPermission: false,
        });
        return win ? { app: win.owner?.name } : undefined;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

async function sample(): Promise<void> {
  let idleSeconds = 0;
  try {
    idleSeconds = powerMonitor.getSystemIdleTime();
  } catch {
    // Not available on this platform; treat as active.
  }
  const isIdle = idleSeconds >= IDLE_THRESHOLD_S;
  if (lastWasIdle && !isIdle) {
    pendingIdleReturn = true;
  }
  lastWasIdle = isIdle;
  if (isIdle) return; // don't watch what isn't happening

  // Refresh the "who they are" open-windows list occasionally (it's heavier).
  if (sampleCount % OPEN_WINDOWS_EVERY === 0) {
    await sampleOpenWindows();
  }
  sampleCount += 1;

  const win = await readActiveWindow();
  if (!win || isClippy(win.app)) return; // ignore ourselves

  const app = win.app;
  const sensitive = isSensitiveTitle(win.title) || isIncognito(win.title);

  if (app && app !== currentApp) {
    const now = Date.now();
    switchTimes.push(now);
    switchTimes = switchTimes.filter((t) => now - t <= THRASH_WINDOW_MS);
    if (seenApps.has(app)) {
      pendingReturnedToApp = true;
    }
    seenApps.add(app);
    currentApp = app;
    appStartedAt = now;
  }

  // Never retain sensitive/incognito titles, even transiently in context.
  currentTitle = sensitive ? undefined : sanitizeTitle(win.title);

  // Tally time on the active app for the long-term pattern memory (app names
  // only). Flush to disk ~once a minute rather than every sample.
  if (currentApp) {
    pendingMinutes[currentApp] =
      (pendingMinutes[currentApp] || 0) + SAMPLE_INTERVAL / 60_000;
  }
  if (sampleCount % FLUSH_EVERY === 0) {
    flushPatterns();
  }
}

function partOfDay(hour: number): PartOfDay {
  if (hour < 5) return "lateNight";
  if (hour < 8) return "earlyMorning";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "night";
}

function formatTime(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m.toString().padStart(2, "0")}${ampm}`;
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function snapshot(consume: boolean): BehavioralContext {
  const now = Date.now();
  const d = new Date();
  const recentSwitches = switchTimes.filter(
    (t) => now - t <= THRASH_WINDOW_MS,
  ).length;
  const dayIndex = d.getDay();
  const isWeekend = dayIndex === 0 || dayIndex === 6;
  const hour = d.getHours();
  const isWorkHours = !isWeekend && hour >= 9 && hour < 18;

  const ctx: BehavioralContext = {
    app: currentApp,
    title: currentTitle,
    minutesOnApp: currentApp
      ? Math.floor((now - appStartedAt) / 60_000)
      : undefined,
    recentSwitches,
    thrashing: recentSwitches >= THRASH_COUNT,
    returnedToApp: pendingReturnedToApp,
    idleReturn: pendingIdleReturn,
    sessionMinutes: Math.floor((now - sessionStart) / 60_000),
    partOfDay: partOfDay(d.getHours()),
    localTime: formatTime(d),
    dayOfWeek: DAY_NAMES[dayIndex],
    isWeekend,
    isWorkHours,
    otherApps: currentOpenApps.filter((a) => a !== currentApp).slice(0, 8),
  };

  if (consume) {
    // One-shot flags are consumed only when this becomes an actual roast — not
    // on the scheduler's frequent peeks. (Pattern memory is fed continuously by
    // the sample loop's flushPatterns, not here.)
    pendingReturnedToApp = false;
    pendingIdleReturn = false;
  }

  return ctx;
}

/**
 * Snapshot for an actual roast — consumes one-shot flags (returnedToApp,
 * idleReturn) and records durable observations.
 */
export function getBehavioralContext(): BehavioralContext {
  return snapshot(true);
}

/**
 * Read-only snapshot for the scheduler to judge salience. Does NOT consume the
 * one-shot flags, so a pending interesting event keeps applying pressure until
 * Clippy actually speaks about it.
 */
export function peekContext(): BehavioralContext {
  return snapshot(false);
}

/** Take a fresh sample immediately (used right before an on-demand roast). */
export async function sampleNow(): Promise<void> {
  await sample();
}

export function startObserver(): void {
  stopObserver();
  const loop = async () => {
    try {
      await sample();
    } catch {
      // ignore a bad sample; we'll try again next tick
    }
    sampleTimer = setTimeout(loop, SAMPLE_INTERVAL);
  };
  sampleTimer = setTimeout(loop, 2_000);
}

export function stopObserver(): void {
  if (sampleTimer) {
    clearTimeout(sampleTimer);
    sampleTimer = undefined;
  }
}
