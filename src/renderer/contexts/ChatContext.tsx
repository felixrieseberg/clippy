import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { electronAi, clippyApi } from "../clippyApi";
import { SharedStateContext } from "./SharedStateContext";
import { useDebugState } from "./DebugContext";
import { ANIMATION_KEYS_BRACKETS } from "../clippy-animation-helpers";
import { drunkify } from "../../helpers/drunkify";
import { playPopSound } from "../helpers/sound";
import {
  buildRoastPrompt,
  buildCriticPrompt,
  mentionsForeignActivity,
  inventsUnknowableDetail,
  repeatsTime,
  claimsWrongTime,
  listsOpenApps,
  DEFAULT_SYSTEM_PROMPT,
  ROAST_ANGLES,
  ROAST_ANGLE_ANIMATIONS,
} from "../../sharedState";
import { DEFAULT_MODEL_NAME } from "../../models";
import { RoastContext } from "../../ipc-messages";
import {
  getFallbackLine,
  looksLikeJunk,
  trimToRoast,
  TALK_ANIMATIONS,
} from "../clippy-lines";

import type { LanguageModelCreateOptions } from "@electron/llm";

type ClippyNamedStatus = "welcome" | "idle" | "responding" | "thinking";

export type ChatContextType = {
  animationKey: string;
  setAnimationKey: (animationKey: string) => void;
  status: ClippyNamedStatus;
  setStatus: (status: ClippyNamedStatus) => void;
  isModelLoaded: boolean;
  /** Whether the speech bubble window is currently showing. */
  isBubbleOpen: boolean;
  setIsBubbleOpen: (isBubbleOpen: boolean) => void;
  /** The latest thing Clippy slurred, shown in the speech bubble. */
  spokenText: string;
  /** Make Clippy proactively heckle the user about what they're doing. */
  roast: (context?: RoastContext) => Promise<void>;
};

export const ChatContext = createContext<ChatContextType | undefined>(
  undefined,
);

// How long a roast lingers on screen before the bubble hides itself.
function readingTimeMs(text: string): number {
  return Math.min(15_000, 5_000 + text.length * 55);
}

// The "writers' room": generate several candidates from different comedic
// angles, drop the generic/repeated ones, then a critic picks the sharpest.
const CANDIDATE_COUNT = 3;
// Generous enough that the model can finish a one-liner even right after a cold
// load — a too-tight cap aborts mid-sentence ("Your browser's…"). Truncated
// output is also rejected downstream (looksLikeJunk), so this only affects how
// often we fall back, never whether a cut-off fragment gets shown.
const PER_CANDIDATE_TIMEOUT_MS = 10_000;
const CRITIC_TIMEOUT_MS = 6_000;
// Hotter than normal so candidates diverge instead of rephrasing each other.
const CANDIDATE_TEMPERATURE = 0.95;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalizeLine(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contentWords(s: string): Set<string> {
  return new Set(normalizeLine(s).split(" ").filter((w) => w.length > 3));
}

/** Is `line` essentially something we've already got/said? */
function isNovel(line: string, against: string[]): boolean {
  const norm = normalizeLine(line);
  const words = contentWords(line);
  return !against.some((other) => {
    if (normalizeLine(other) === norm) return true;
    const ow = contentWords(other);
    if (words.size === 0 || ow.size === 0) return false;
    let inter = 0;
    for (const w of words) if (ow.has(w)) inter += 1;
    return inter / (words.size + ow.size - inter) >= 0.5;
  });
}

/**
 * Send one prompt to the ALREADY-LOADED session and return the raw text. Aborts
 * (and returns what it has) after `timeoutMs`. Does NOT create/reload the model
 * — the caller resets the session once per roast; reloading per candidate
 * thrashes the node-llama-cpp child process (load→crash loop).
 */
async function promptOnce(prompt: string, timeoutMs: number): Promise<string> {
  let out = "";
  const requestUUID = crypto.randomUUID();
  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    try {
      window.electronAi.abortRequest(requestUUID);
    } catch {
      // request may not have started yet
    }
  }, timeoutMs);

  try {
    const response = await window.electronAi.promptStreaming(prompt, {
      requestUUID,
    });
    for await (const chunk of response) {
      out += chunk;
      if (timedOut) break;
    }
  } catch {
    // return whatever we managed to collect
  } finally {
    window.clearTimeout(timer);
  }

  return out;
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const [animationKey, setAnimationKey] = useState<string>("");
  const [status, setStatus] = useState<ClippyNamedStatus>("welcome");
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isBubbleOpen, setIsBubbleOpen] = useState(false);
  const [spokenText, setSpokenText] = useState<string>("");
  const { settings, models } = useContext(SharedStateContext);
  const debug = useDebugState();
  const [hasPerformedStartupCheck, setHasPerformedStartupCheck] =
    useState(false);

  // Refs so the long-lived roast callback always sees current values without
  // re-subscribing the IPC listener on every render.
  const statusRef = useRef(status);
  const modelLoadedRef = useRef(isModelLoaded);
  const soundEnabledRef = useRef(settings.soundEnabled !== false);
  const dismissTimerRef = useRef<number | undefined>(undefined);
  // The options the model session was created with, so a roast can reset the
  // conversation to a clean slate (no accumulated drift) before prompting.
  const createOptionsRef = useRef<LanguageModelCreateOptions | null>(null);
  // Whether to use the user's Claude key (cloud) instead of the local model.
  const useCloudRef = useRef(!!settings.claudeApiKey?.trim());
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  useEffect(() => {
    modelLoadedRef.current = isModelLoaded;
  }, [isModelLoaded]);
  useEffect(() => {
    soundEnabledRef.current = settings.soundEnabled !== false;
  }, [settings.soundEnabled]);
  useEffect(() => {
    useCloudRef.current = !!settings.claudeApiKey?.trim();
  }, [settings.claudeApiKey]);

  const getSystemPrompt = useCallback(() => {
    // settings.systemPrompt is undefined until the full state loads over IPC;
    // fall back to the default so calling this during the first render (e.g. to
    // seed systemPromptRef) can't throw.
    return (settings.systemPrompt || DEFAULT_SYSTEM_PROMPT).replace(
      "[LIST OF ANIMATIONS]",
      ANIMATION_KEYS_BRACKETS.join(", "),
    );
  }, [settings.systemPrompt]);

  // The persona system prompt, kept current for the cloud path (which may run
  // even when no local model is selected).
  const systemPromptRef = useRef(getSystemPrompt());
  useEffect(() => {
    systemPromptRef.current = getSystemPrompt();
  }, [getSystemPrompt]);

  // Build (but do NOT load) the session options whenever settings change. The
  // model is loaded on demand at roast time and unloaded right after, so it
  // isn't held in memory while Clippy is just sitting there.
  useEffect(() => {
    if (!settings.selectedModel) {
      createOptionsRef.current = null;
      return;
    }
    createOptionsRef.current = {
      modelAlias: settings.selectedModel,
      systemPrompt: getSystemPrompt(),
      topK: settings.topK,
      temperature: settings.temperature,
    };
  }, [
    settings.selectedModel,
    settings.topK,
    settings.temperature,
    getSystemPrompt,
  ]);

  // "Ready" now means a model is selected AND downloaded — not that it's
  // currently resident in RAM (it loads on demand).
  useEffect(() => {
    if (debug?.simulateDownload) {
      setIsModelLoaded(true);
      return;
    }
    setIsModelLoaded(
      !!settings.selectedModel && !!models[settings.selectedModel]?.downloaded,
    );
  }, [settings.selectedModel, models, debug?.simulateDownload]);

  const roast = useCallback(async (context?: RoastContext) => {
    // Don't heckle if there's no brain available, or he's mid-thought. In cloud
    // mode the Claude key is the brain (no local model needed).
    if (!useCloudRef.current && !modelLoadedRef.current) return;
    if (
      statusRef.current === "thinking" ||
      statusRef.current === "responding"
    ) {
      return;
    }

    const passedCtx = context || {};

    // Mark busy so overlapping triggers are ignored — but show NOTHING yet (no
    // bubble, no sound). The model loads on demand and the writers' room takes a
    // few seconds; an empty "thinking" bubble would just feel broken. We reveal
    // only once the finished line is ready, below.
    setStatus("thinking");

    let chosenText = "";
    let chosenAnimation = "";
    // The context main sent was captured when the roast fired. A slow model load
    // can put 10–20s between then and now, so we re-fetch the freshest context
    // right before generating — otherwise he describes the tab you already left.
    let activeCtx: RoastContext = passedCtx;
    let recentLines = passedCtx.recentLines || [];
    const baseOptions = createOptionsRef.current;

    const refreshContext = async () => {
      try {
        const fresh = await clippyApi.getRoastContext();
        if (fresh) {
          activeCtx = fresh;
          recentLines = fresh.recentLines || [];
        }
      } catch {
        // keep what main sent
      }
    };

    // Shared validity check: in character, fresh, doesn't misdescribe the
    // screen, no invented specifics, no doubled time.
    const isUsable = (text: string, against: string[]): boolean =>
      !!text &&
      !looksLikeJunk(text) &&
      isNovel(text, against) &&
      !mentionsForeignActivity(
        text,
        activeCtx.app,
        activeCtx.title,
        activeCtx.behavior?.otherApps,
      ) &&
      !inventsUnknowableDetail(text) &&
      !repeatsTime(text) &&
      !claimsWrongTime(text, activeCtx.behavior) &&
      !listsOpenApps(text, activeCtx.behavior?.otherApps);

    if (useCloudRef.current) {
      // CLOUD BRAIN (Claude). Fast, so just grab fresh context and go. One
      // frontier-model call is plenty — try a 2nd angle only if it trips a filter.
      await refreshContext();
      const angles = shuffle([...ROAST_ANGLES.keys()]);
      for (let attempt = 0; attempt < 2 && !chosenText; attempt++) {
        const angleIndex = angles[attempt % angles.length];
        let raw = "";
        try {
          raw = await clippyApi.generateCloud(
            systemPromptRef.current,
            buildRoastPrompt(activeCtx, angleIndex),
          );
        } catch (error) {
          // Network/key problem — stop and fall back to a hand-written line.
          console.warn("Cloud roast failed", error);
          break;
        }
        const text = trimToRoast(raw);
        if (isUsable(text, recentLines)) {
          chosenText = text;
          chosenAnimation =
            ROAST_ANGLE_ANIMATIONS[angleIndex % ROAST_ANGLE_ANIMATIONS.length];
        }
      }
    } else if (baseOptions) {
      // Reset the session ONCE per roast (anti-drift) and reuse it for every
      // candidate + the critic. Reloading the model per candidate crashes the
      // child process, so all generation happens as prompts in this one session.
      let sessionReady = false;
      try {
        await electronAi.create({
          ...baseOptions,
          temperature: CANDIDATE_TEMPERATURE,
        });
        sessionReady = true;
      } catch {
        // couldn't reset — we'll fall through to a hand-written line
      }

      if (sessionReady) {
        // Re-fetch context now that the (slow) load is done, so the roast is
        // about what they're doing NOW, not when it fired.
        await refreshContext();

        // Candidates from a few DIFFERENT comedic angles; keep only the ones
        // that are in-character, fresh, and don't misdescribe the screen.
        const angles = shuffle([...ROAST_ANGLES.keys()]).slice(
          0,
          CANDIDATE_COUNT,
        );
        const kept: Array<{ text: string; animation: string }> = [];
        const keptText: string[] = [];

        for (const angleIndex of angles) {
          const prompt = buildRoastPrompt(activeCtx, angleIndex);
          const raw = await promptOnce(prompt, PER_CANDIDATE_TIMEOUT_MS);

          const text = trimToRoast(raw);
          if (!text || looksLikeJunk(text)) continue;
          if (!isNovel(text, [...recentLines, ...keptText])) continue;
          // Reject lines that invent an activity they don't actually have open
          // (immersion-break); the active app + other open apps are all fair.
          if (
            mentionsForeignActivity(
              text,
              activeCtx.app,
              activeCtx.title,
              activeCtx.behavior?.otherApps,
            )
          )
            continue;
          // Reject invented specifics he couldn't know (head counts, etc.).
          if (inventsUnknowableDetail(text)) continue;
          // Reject lines that state the time twice (reads as broken).
          if (repeatsTime(text)) continue;
          // Reject a fabricated time / night-trope when it's not actually late.
          if (claimsWrongTime(text, activeCtx.behavior)) continue;
          // Reject lines that just enumerate the open apps (name-dropping).
          if (listsOpenApps(text, activeCtx.behavior?.otherApps)) continue;

          kept.push({
            text,
            animation:
              ROAST_ANGLE_ANIMATIONS[
                angleIndex % ROAST_ANGLE_ANIMATIONS.length
              ],
          });
          keptText.push(text);
        }

        if (kept.length === 1) {
          chosenText = kept[0].text;
          chosenAnimation = kept[0].animation;
        } else if (kept.length > 1) {
          // Critic pass (same session): pick the sharpest. Robust to flakiness —
          // if it doesn't answer with a clean number, we keep the first.
          let winner = kept[0];
          const criticRaw = await promptOnce(
            buildCriticPrompt(keptText),
            CRITIC_TIMEOUT_MS,
          );
          const match = criticRaw.match(/\d+/);
          if (match) {
            const idx = parseInt(match[0], 10) - 1;
            if (idx >= 0 && idx < kept.length) winner = kept[idx];
          }
          chosenText = winner.text;
          chosenAnimation = winner.animation;
        }
      }
    }

    // Only if the model gave us nothing usable do we reach for a hand-written
    // line — and even then we try to pick one he hasn't used recently.
    if (!chosenText) {
      let fallback = getFallbackLine(activeCtx);
      for (let i = 0; i < 4 && !isNovel(fallback.text, recentLines); i++) {
        fallback = getFallbackLine(activeCtx);
      }
      chosenText = fallback.text;
      chosenAnimation = fallback.animation;
    }

    if (!chosenAnimation) {
      chosenAnimation =
        TALK_ANIMATIONS[Math.floor(Math.random() * TALK_ANIMATIONS.length)];
    }

    const spoken = drunkify(chosenText);
    setAnimationKey(chosenAnimation);
    setSpokenText(spoken);
    setStatus("responding");
    setIsBubbleOpen(true);
    // Sound the notification right as the roast appears, not on the empty
    // "thinking" bubble.
    if (soundEnabledRef.current) {
      playPopSound();
    }

    // Remember the line (pre-slur content) so he never repeats himself.
    try {
      clippyApi.roastSpoken(chosenText);
    } catch {
      // memory is best-effort
    }

    // Unload the local model now (cloud mode never loaded one) — we're done
    // with it until the next roast, which reloads on demand. This is what keeps
    // Clippy from being a memory hog while he's just sitting there.
    if (!useCloudRef.current) {
      electronAi.destroy().catch(() => {});
    }

    if (dismissTimerRef.current) {
      window.clearTimeout(dismissTimerRef.current);
    }
    dismissTimerRef.current = window.setTimeout(() => {
      setIsBubbleOpen(false);
      setStatus("idle");
    }, readingTimeMs(spoken));
  }, []);

  // If selectedModel is undefined or unavailable, fall back to the first
  // downloaded model.
  useEffect(() => {
    if (
      !settings.selectedModel ||
      !models[settings.selectedModel] ||
      !models[settings.selectedModel].downloaded
    ) {
      const downloadedModel = Object.values(models).find(
        (model) => model.downloaded,
      );

      if (downloadedModel) {
        clippyApi.setState("settings.selectedModel", downloadedModel.name);
      }
    }
  }, [models]);

  // At startup, make sure our preferred default model is downloading/ready so
  // Clippy ends up with a capable voice. (Any already-downloaded model serves
  // as a stopgap until the preferred one finishes — see the migration below.)
  useEffect(() => {
    if (Object.keys(models).length === 0 || hasPerformedStartupCheck) {
      return;
    }
    // If the user is running on their Claude key, don't pull down a 2GB local
    // model they won't use.
    if (settings.claudeApiKey?.trim()) {
      return;
    }

    setHasPerformedStartupCheck(true);

    const preferred = models[DEFAULT_MODEL_NAME];
    if (preferred?.downloaded || preferred?.downloadState) {
      return;
    }

    const downloadPreferred = async () => {
      await clippyApi.downloadModelByName(DEFAULT_MODEL_NAME);
      setTimeout(() => clippyApi.updateModelState(), 500);
    };

    void downloadPreferred();
  }, [models, hasPerformedStartupCheck]);

  // One-time migration: as soon as the preferred model is downloaded, make it
  // the active one (upgrading installs that were running an older default like
  // Gemma 1B). We only do this once so a deliberate manual choice later sticks.
  useEffect(() => {
    if (settings.preferredModelApplied) {
      return;
    }

    if (models[DEFAULT_MODEL_NAME]?.downloaded) {
      clippyApi.setState("settings.selectedModel", DEFAULT_MODEL_NAME);
      clippyApi.setState("settings.preferredModelApplied", true);
    }
  }, [models, settings.preferredModelApplied]);

  // Subscribe to roast requests pushed from the main process.
  useEffect(() => {
    clippyApi.offRoastContext();
    clippyApi.onRoastContext((context) => {
      void roast(context);
    });

    return () => {
      clippyApi.offRoastContext();
    };
  }, [roast]);

  const value = {
    animationKey,
    setAnimationKey,
    status,
    setStatus,
    isModelLoaded,
    isBubbleOpen,
    setIsBubbleOpen,
    spokenText,
    roast,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const context = useContext(ChatContext);

  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }

  return context;
}
