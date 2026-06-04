import { DEFAULT_SETTINGS, SettingsState } from "../../sharedState";
import { clippyApi } from "../clippyApi";
import { useSharedState } from "../contexts/SharedStateContext";
import { Checkbox } from "./Checkbox";

export const SettingsAppearance: React.FC = () => {
  const { settings } = useSharedState();

  const onReset = () => {
    const defaultOptions: SettingsState = {
      defaultFont: DEFAULT_SETTINGS.defaultFont,
      defaultFontSize: DEFAULT_SETTINGS.defaultFontSize,
      clippyAlwaysOnTop: DEFAULT_SETTINGS.clippyAlwaysOnTop,
      soberMode: DEFAULT_SETTINGS.soberMode,
      soundEnabled: DEFAULT_SETTINGS.soundEnabled,
      readWindowTitles: DEFAULT_SETTINGS.readWindowTitles,
    };

    for (const key in defaultOptions) {
      clippyApi.setState(
        `settings.${key}`,
        defaultOptions[key as keyof SettingsState],
      );
    }
  };

  return (
    <div>
      <fieldset>
        <legend>Options</legend>
        <Checkbox
          id="clippyAlwaysOnTop"
          label="Keep Clippy always on top of all other windows"
          checked={settings.clippyAlwaysOnTop}
          onChange={(checked) => {
            clippyApi.setState("settings.clippyAlwaysOnTop", checked);
          }}
        />
        <Checkbox
          id="soberMode"
          label="Sober Mode (Clippy keeps his unsolicited opinions to himself)"
          checked={settings.soberMode}
          onChange={(checked) => {
            clippyApi.setState("settings.soberMode", checked);
          }}
        />
        <Checkbox
          id="soundEnabled"
          label="Play a sound when Clippy pops up"
          checked={settings.soundEnabled !== false}
          onChange={(checked) => {
            clippyApi.setState("settings.soundEnabled", checked);
          }}
        />
      </fieldset>
      <fieldset>
        <legend>What Clippy Can See</legend>
        <Checkbox
          id="readWindowTitles"
          label="Let Clippy read window titles for sharper roasts"
          checked={settings.readWindowTitles === true}
          onChange={(checked) => {
            clippyApi.setState("settings.readWindowTitles", checked);
            // Ask macOS for Screen Recording permission right when they opt in.
            if (checked) {
              clippyApi.ensureScreenPermission();
            }
          }}
        />
        <p style={{ fontSize: 11, lineHeight: 1.4, marginTop: 6 }}>
          Off by default, Clippy only knows <i>which app</i> is open (e.g.
          "Safari"). Turn this on and he also reads the active window's{" "}
          <i>title</i> — the page or document name — so his jabs can get
          specific.
          <br />
          <br />
          <strong>It's safe and private:</strong> the title is read on your
          computer, handed only to the language model running locally on this
          machine, and <strong>never sent anywhere or saved to logs</strong>.
          Nothing leaves your device. Titles that look sensitive (passwords,
          banking, private browsing) are skipped automatically.
          <br />
          <br />
          On macOS you'll be asked for "Screen Recording" permission — that's
          just how Apple gates reading other apps' window titles. Clippy never
          captures or records your screen. You may need to grant it in System
          Settings and relaunch.
        </p>
      </fieldset>
      <fieldset>
        <legend>What Clippy Remembers</legend>
        <p style={{ fontSize: 11, lineHeight: 1.4, marginTop: 0 }}>
          Clippy keeps a small, <strong>on-device</strong> memory so he doesn't
          repeat himself and can call back to your habits over time. It holds
          only his own past lines and general, non-sensitive notes (app names
          and patterns) — <strong>never window contents, and nothing at all from
          private/incognito or sensitive windows</strong>. It never leaves your
          computer.
        </p>
        <button
          onClick={() => {
            clippyApi.clearMemory();
          }}
        >
          Make Clippy Forget Everything
        </button>
      </fieldset>
      <fieldset>
        <legend>Clippy's Brain</legend>
        <div className="field-row-stacked" style={{ width: "100%" }}>
          <label htmlFor="claudeApiKey">
            Anthropic API key (optional — for much sharper wit)
          </label>
          <input
            id="claudeApiKey"
            type="password"
            placeholder="sk-ant-…"
            value={settings.claudeApiKey || ""}
            onChange={(event) => {
              clippyApi.setState(
                "settings.claudeApiKey",
                event.target.value.trim(),
              );
            }}
          />
        </div>
        <p style={{ fontSize: 11, lineHeight: 1.4, marginTop: 6 }}>
          By default Clippy thinks <strong>locally and offline</strong> — private,
          but only as witty as a small model can be. Paste an{" "}
          <strong>Anthropic API key</strong> and his brain becomes Claude: far
          sharper, and the heavy local model isn't loaded at all.
          <br />
          <br />
          The trade-off: in this mode, what Clippy sees (the app/activity context
          — never sensitive or incognito titles) is <strong>sent to Anthropic</strong>{" "}
          to write each line, and it uses your API credits. The key is stored
          locally on this machine. Clear the box to go back to fully local.
        </p>
      </fieldset>
      <button style={{ marginTop: 10 }} onClick={onReset}>
        Reset
      </button>
    </div>
  );
};
