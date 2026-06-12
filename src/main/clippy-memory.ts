import Store from "electron-store";

/**
 * Clippy's local, on-device memory.
 *
 *   - `saidLines`: every roast he's spoken, so a novelty filter guarantees he
 *     never repeats himself.
 *   - `apps` / `lateNightDays`: a lightweight behavioral history (APP NAMES and
 *     day-stamps only — never window titles, never anything sensitive/incognito)
 *     from which we DERIVE frequency/recency callbacks so he feels like he
 *     actually knows you ("you were buried in this yesterday too," "third night
 *     this week you're up this late").
 *
 * Nothing here ever leaves the machine.
 */

type AppStat = {
  /** Cumulative minutes observed in this app. */
  minutes: number;
  /** Local day-numbers this app was used on (recent, deduped). */
  days: number[];
};

type MemoryData = {
  saidLines: string[];
  apps: Record<string, AppStat>;
  /** Local day-numbers when late-night activity was seen (recent, deduped). */
  lateNightDays: number[];
};

const store = new Store<MemoryData>({
  name: "clippy-memory",
  defaults: { saidLines: [], apps: {}, lateNightDays: [] },
});

const MAX_SAID = 250;
const MAX_APPS = 30;
const MAX_DAYS_PER_APP = 21;
const MAX_LATE_DAYS = 30;
// How similar (Jaccard over content words) a new line can be to a past one
// before we consider it a repeat.
const SIMILARITY_LIMIT = 0.5;

/** Local-timezone day number (days since epoch), so "yesterday" works. */
function localDayKey(d: Date): number {
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contentWords(s: string): Set<string> {
  return new Set(normalize(s).split(" ").filter((w) => w.length > 3));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) {
    if (b.has(w)) intersection += 1;
  }
  return intersection / (a.size + b.size - intersection);
}

/** The last `n` lines he's said, for handing to the prompt as an avoid-list. */
export function getRecentLines(n = 14): string[] {
  return (store.get("saidLines") || []).slice(-n);
}

/**
 * Has he said something essentially like this before? Compares against recent
 * history plus any in-flight candidates passed in `extra`.
 */
export function isTooSimilar(candidate: string, extra: string[] = []): boolean {
  const candWords = contentWords(candidate);
  const candNorm = normalize(candidate);
  const pool = [...(store.get("saidLines") || []).slice(-100), ...extra];

  for (const past of pool) {
    if (normalize(past) === candNorm) return true;
    if (jaccard(candWords, contentWords(past)) >= SIMILARITY_LIMIT) return true;
  }
  return false;
}

export function recordLine(line: string): void {
  const trimmed = line.trim();
  if (!trimmed) return;
  const lines = store.get("saidLines") || [];
  lines.push(trimmed);
  store.set("saidLines", lines.slice(-MAX_SAID));
}

/**
 * Record a slice of activity: time spent in an app. Computes the day-stamp and
 * late-night flag itself (called ~once a minute by the observer). App names
 * only — no titles ever reach here.
 */
export function recordActivity(app: string, minutes: number): void {
  if (!app || minutes <= 0) return;

  const d = new Date();
  const dayKey = localDayKey(d);
  const hour = d.getHours();
  const isLate = hour >= 23 || hour < 5;

  const apps = store.get("apps") || {};
  const stat: AppStat = apps[app] || { minutes: 0, days: [] };
  stat.minutes += minutes;
  if (!stat.days.includes(dayKey)) {
    stat.days.push(dayKey);
    if (stat.days.length > MAX_DAYS_PER_APP) {
      stat.days = stat.days.slice(-MAX_DAYS_PER_APP);
    }
  }
  apps[app] = stat;

  // Keep only the most-used apps so the store stays bounded.
  const keys = Object.keys(apps);
  if (keys.length > MAX_APPS) {
    keys.sort((a, b) => apps[b].minutes - apps[a].minutes);
    const pruned: Record<string, AppStat> = {};
    for (const k of keys.slice(0, MAX_APPS)) pruned[k] = apps[k];
    store.set("apps", pruned);
  } else {
    store.set("apps", apps);
  }

  if (isLate) {
    let late = store.get("lateNightDays") || [];
    if (!late.includes(dayKey)) {
      late.push(dayKey);
      late = late.slice(-MAX_LATE_DAYS);
      store.set("lateNightDays", late);
    }
  }
}

/**
 * Derive a few frequency/recency callbacks from the history — phrased about
 * "this" (the current activity) or general habits, NOT by naming a different
 * app, so they don't trip the foreign-activity filter when Clippy uses one.
 */
export function getObservations(currentApp?: string): string[] {
  const today = localDayKey(new Date());
  const within7 = (d: number) => today - d >= 0 && today - d <= 7;

  const obs: string[] = [];
  const apps = store.get("apps") || {};
  const lateNightDays = store.get("lateNightDays") || [];

  // Late-night habit.
  const lateNights = new Set(lateNightDays.filter(within7)).size;
  if (lateNights >= 3) {
    obs.push(`you've been up in the small hours most nights this week`);
  } else if (lateNights >= 2) {
    obs.push(`this isn't the first night this week you've been up this late`);
  }

  // Current-activity continuity (about "this", so it stays in-category).
  if (currentApp && apps[currentApp]) {
    const days = apps[currentApp].days.filter(within7);
    const distinct = new Set(days).size;
    if (distinct >= 4) {
      obs.push(`you're back at this exact thing damn near every day lately`);
    } else if (days.includes(today - 1)) {
      obs.push(`you were buried in this same thing yesterday too`);
    }

    // This activity dominates their time → "your whole life is here".
    const total = Object.values(apps).reduce((s, a) => s + a.minutes, 0);
    const mins = apps[currentApp].minutes;
    if (total >= 180 && mins >= 120 && mins / total >= 0.5) {
      obs.push(`more of your waking life happens right here than anywhere else`);
    }
  }

  return obs.slice(0, 3);
}

/** Wipe everything Clippy remembers. */
export function clearMemory(): void {
  store.set("saidLines", []);
  store.set("apps", {});
  store.set("lateNightDays", []);
}
