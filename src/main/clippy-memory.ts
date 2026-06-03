import Store from "electron-store";

/**
 * Clippy's local, on-device memory. Two things live here:
 *   - `saidLines`: every roast he's spoken (pre-slur content), so a novelty
 *     filter can guarantee he never repeats himself.
 *   - `observations`: durable, NON-SENSITIVE notes about the user's patterns
 *     (app names and behaviors only — never window titles, never anything from
 *     a sensitive/incognito context), used for callbacks so he feels like he
 *     actually knows you.
 *
 * Nothing here ever leaves the machine. Sensitive/private content is filtered
 * out by ./privacy before it could ever reach this module.
 */

type MemoryData = {
  saidLines: string[];
  observations: string[];
};

const store = new Store<MemoryData>({
  name: "clippy-memory",
  defaults: { saidLines: [], observations: [] },
});

const MAX_SAID = 250;
const MAX_OBS = 60;
// How similar (Jaccard over content words) a new line can be to a past one
// before we consider it a repeat.
const SIMILARITY_LIMIT = 0.5;

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

/** Durable, deduped notes about the user for callbacks. */
export function getObservations(n = 8): string[] {
  return (store.get("observations") || []).slice(-n);
}

export function recordObservation(note: string): void {
  const trimmed = note.trim();
  if (!trimmed) return;
  const obs = store.get("observations") || [];
  const norm = normalize(trimmed);
  if (obs.some((o) => normalize(o) === norm)) return;
  obs.push(trimmed);
  store.set("observations", obs.slice(-MAX_OBS));
}

/** Wipe everything Clippy remembers. */
export function clearMemory(): void {
  store.set("saidLines", []);
  store.set("observations", []);
}
