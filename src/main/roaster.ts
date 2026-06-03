import { getMainWindow } from "./windows";
import { getStateManager } from "./state";
import { getLogger } from "./logger";
import { IpcMessages, RoastContext } from "../ipc-messages";

let timer: NodeJS.Timeout | undefined;
// The last real (non-Clippy) foreground app we saw, so clicking Clippy — which
// steals focus — still roasts whatever the user was actually looking at.
let lastContext: RoastContext | undefined;

// How often Clippy pipes up: somewhere between 45s and 2min, jittered so he
// doesn't feel like a metronome.
const MIN_DELAY = 45_000;
const MAX_DELAY = 120_000;
// Give the model a moment to load before the first heckle.
const STARTUP_DELAY = 8_000;

function nextDelay(): number {
  return MIN_DELAY + Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY));
}

function isClippy(app?: string): boolean {
  return !!app && /clippy|electron/i.test(app);
}

// Window titles that look sensitive are dropped so we never feed them to the
// model — Clippy falls back to roasting the app name instead. (Even though
// everything is local, there's no reason to slurp up a password manager title.)
const SENSITIVE_TITLE =
  /password|passwd|1password|bitwarden|lastpass|keychain|bank|chase|wells\s*fargo|paypal|venmo|credit\s*card|\bssn\b|social security|incognito|private browsing|sign[\s-]?in|log[\s-]?in|two[\s-]?factor|authenticat|recovery|seed phrase|wallet/i;

function sanitizeTitle(title?: string): string | undefined {
  const t = (title || "").trim();
  if (!t || SENSITIVE_TITLE.test(t)) {
    return undefined;
  }
  // Cap length so a giant title can't bloat the prompt.
  return t.length > 120 ? t.slice(0, 120) : t;
}

async function getActiveContext(): Promise<RoastContext | undefined> {
  // get-windows is ESM-only; dynamic import keeps the bundled main happy.
  const { activeWindow } = await import("get-windows");

  // Reading the window TITLE needs macOS Screen Recording permission, and
  // requesting it without the grant makes the helper binary error out
  // ("Command failed"). So we only ask for it when the user has opted in; the
  // app NAME alone works with no permission at all.
  const readTitles =
    getStateManager().store.get("settings").readWindowTitles === true;

  try {
    const win = await activeWindow({
      screenRecordingPermission: readTitles,
      accessibilityPermission: false,
    });

    if (!win) {
      return undefined;
    }

    return {
      app: win.owner?.name,
      title: readTitles ? sanitizeTitle(win.title) : undefined,
    };
  } catch (error) {
    // Titles requested but permission likely not granted yet — retry app-only
    // so Clippy still works while the user sorts out the permission.
    if (readTitles) {
      try {
        const win = await activeWindow({
          screenRecordingPermission: false,
          accessibilityPermission: false,
        });
        return win ? { app: win.owner?.name } : undefined;
      } catch {
        // fall through to the warning below
      }
    }

    getLogger().warn("Roaster: could not read the active window", error);
    return undefined;
  }
}

// The best context to roast right now: the live foreground if it's a real app,
// otherwise the last real app we remember.
async function currentRoastContext(): Promise<RoastContext> {
  const ctx = await getActiveContext();

  if (ctx?.app && !isClippy(ctx.app)) {
    lastContext = ctx;
    return ctx;
  }

  return lastContext || ctx || {};
}

async function tick(): Promise<void> {
  if (getStateManager().store.get("settings").soberMode) {
    return;
  }

  const win = getMainWindow();
  if (!win || win.isDestroyed()) {
    return;
  }

  const context = await currentRoastContext();
  win.webContents.send(IpcMessages.ROAST_CONTEXT, context);
}

export function startRoaster(): void {
  stopRoaster();

  const loop = async () => {
    await tick();
    timer = setTimeout(loop, nextDelay());
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
  if (!win || win.isDestroyed()) {
    return;
  }

  const context = await currentRoastContext();
  win.webContents.send(IpcMessages.ROAST_CONTEXT, context);
}
