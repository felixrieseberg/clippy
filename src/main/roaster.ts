import { getMainWindow } from "./windows";
import { getStateManager } from "./state";
import { getLogger } from "./logger";
import { IpcMessages, RoastContext } from "../ipc-messages";

let timer: NodeJS.Timeout | undefined;
// The last real (non-Clippy) foreground app we saw, so clicking Clippy — which
// steals focus — still roasts whatever the user was actually looking at.
let lastContext: RoastContext | undefined;

// TESTING CADENCE: short and chatty so it's easy to see him work. Bump these
// way up (e.g. 90_000–240_000) before shipping so he isn't exhausting.
const MIN_DELAY = 12_000;
const MAX_DELAY = 25_000;
// Give the model a moment to load before the first heckle.
const STARTUP_DELAY = 8_000;

function nextDelay(): number {
  return MIN_DELAY + Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY));
}

function isClippy(app?: string): boolean {
  return !!app && /clippy|electron/i.test(app);
}

async function getActiveContext(): Promise<RoastContext | undefined> {
  try {
    // get-windows is ESM-only; dynamic import keeps the bundled main happy.
    const { activeWindow } = await import("get-windows");
    // Disable the macOS permission checks: reading the window TITLE needs
    // Screen Recording permission, and without it the helper binary errors out
    // entirely ("Command failed"). We only need the app NAME for contextual
    // roasts, which works without any permission. (title comes back empty.)
    const win = await activeWindow({
      screenRecordingPermission: false,
      accessibilityPermission: false,
    });

    getLogger().info(
      `Roaster: activeWindow -> app="${win?.owner?.name}" title="${win?.title}"`,
    );

    if (!win) {
      return undefined;
    }

    return { app: win.owner?.name, title: win.title };
  } catch (error) {
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
  getLogger().info(
    `Roaster: sending ROAST_CONTEXT app="${context.app}" title="${context.title}"`,
  );
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
