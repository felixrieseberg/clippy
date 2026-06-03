import {
  app,
  desktopCapturer,
  dialog,
  shell,
  systemPreferences,
} from "electron";
import { getLogger } from "./logger";

/**
 * On macOS, reading another app's window TITLE requires the "Screen Recording"
 * permission. get-windows shells out to a separate helper binary that can't
 * surface a usable system prompt from inside Electron, so when the user opts in
 * we trigger the prompt HERE — which attributes it to the app — and then point
 * them at the right System Settings pane.
 *
 * No-op on Windows/Linux, where window titles need no special permission.
 */
export async function ensureScreenRecordingPermission(): Promise<void> {
  if (process.platform !== "darwin") {
    return;
  }

  try {
    if (systemPreferences.getMediaAccessStatus("screen") === "granted") {
      return;
    }

    // Enumerating screen sources is the documented way to provoke the macOS
    // Screen Recording prompt for this app. We don't use the result.
    try {
      await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: 1, height: 1 },
      });
    } catch {
      // Ignore — we only call this to trigger the permission prompt.
    }

    if (systemPreferences.getMediaAccessStatus("screen") === "granted") {
      return;
    }

    // Still not granted: macOS only shows the auto-prompt once, and the app
    // must be relaunched after granting. Guide the user the rest of the way.
    const appName = app.getName();
    // In development the running binary is Electron, so that's what shows up in
    // the Screen Recording list (the packaged app appears under its real name).
    const listedAs = app.isPackaged ? `"${appName}"` : `"${appName}" (or "Electron")`;
    const { response } = await dialog.showMessageBox({
      type: "info",
      buttons: ["Open System Settings", "Not Now"],
      defaultId: 0,
      cancelId: 1,
      title: "Let Clippy read window titles",
      message: 'Clippy needs "Screen Recording" permission to read window titles.',
      detail:
        `macOS uses the "Screen Recording" permission to gate reading other apps' ` +
        `window titles. Clippy never captures or records your screen, and titles ` +
        `stay on your device.\n\n` +
        `In the list that opens, turn on ${listedAs}, then quit and reopen Clippy.`,
    });

    if (response === 0) {
      await shell.openExternal(
        "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
      );
    }
  } catch (error) {
    getLogger().warn("Could not ensure screen recording permission", error);
  }
}
