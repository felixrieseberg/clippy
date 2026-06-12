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
import { playPopSound } from "../helpers/sound";
import {
  buildRoastPrompt,
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
import { looksLikeJunk, trimToRoast, TALK_ANIMATIONS } from "../clippy-lines";

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

// Simplified writers' room: try a few comedic angles and take the FIRST line
// that passes the filters (no separate critic call). On a capable model the
// first clean, true line is good, and this keeps latency down on the big local
// model. If none pass, Clippy stays silent rather than drop a canned line.
const LOCAL_ATTEMPTS = 3;
const CLOUD_ATTEMPTS = 2; // Claude is reliable; don't burn extra API calls
// Generous enough that the model can finish a one-liner even right after a cold
// load — a too-tight cap aborts mid-sentence ("Your browser's…"). Truncated
// output is also rejected downstream (looksLikeJunk).
const PER_CANDIDATE_TIMEOUT_MS = 10_000;
// The model is large, so reloading it every roast (load-on-demand) is slow.
// Keep it warm for a bit after a roast for fast follow-ups, then unload to free
// memory once you've gone quiet. Force a clean reload every few roasts so the
// reused session doesn't accumulate too much conversation and drift.
const KEEP_WARM_MS = 180_000;
const FRESH_SESSION_EVERY = 3;
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
  // Keep-warm state for the local model (avoid reloading ~5GB every roast).
  const modelWarmRef = useRef(false);
  const roastsThisSessionRef = useRef(0);
  const unloadTimerRef = useRef<number | undefined>(undefined);
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

    // A line is usable only if it's in character, fresh, and trips none of the
    // immersion-break filters. These ARE the guardrail — which is why the prompt
    // itself can stay a positive brief rather than a wall of "don'ts".
    const isUsable = (text: string): boolean =>
      !!text &&
      !looksLikeJunk(text) &&
      isNovel(text, recentLines) &&
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

    // Generate one candidate line for a comedic angle, from whichever brain.
    const generateForAngle = async (angleIndex: number): Promise<string> => {
      const prompt = buildRoastPrompt(activeCtx, angleIndex);
      if (useCloudRef.current) {
        return trimToRoast(
          await clippyApi.generateCloud(systemPromptRef.current, prompt),
        );
      }
      return trimToRoast(await promptOnce(prompt, PER_CANDIDATE_TIMEOUT_MS));
    };

    // Ready the brain. Cloud needs nothing loaded; the local model loads on
    // demand and is kept warm between nearby roasts (forced clean reload every
    // few roasts so the reused session doesn't drift), then re-fetch fresh
    // context once the (slow) load is done.
    let brainReady = useCloudRef.current;
    if (useCloudRef.current) {
      await refreshContext();
    } else if (baseOptions) {
      try {
        const needsFreshLoad =
          !modelWarmRef.current ||
          roastsThisSessionRef.current >= FRESH_SESSION_EVERY;
        if (needsFreshLoad) {
          await electronAi.create({
            ...baseOptions,
            temperature: CANDIDATE_TEMPERATURE,
          });
          modelWarmRef.current = true;
          roastsThisSessionRef.current = 0;
        }
        roastsThisSessionRef.current += 1;
        brainReady = true;
      } catch {
        modelWarmRef.current = false;
      }
      if (brainReady) {
        await refreshContext();
      }
    }

    // Try a few angles; take the FIRST line that passes the filters.
    if (brainReady) {
      const maxAttempts = useCloudRef.current ? CLOUD_ATTEMPTS : LOCAL_ATTEMPTS;
      const angles = shuffle([...ROAST_ANGLES.keys()]);
      for (let i = 0; i < maxAttempts && !chosenText; i++) {
        const angleIndex = angles[i % angles.length];
        let text = "";
        try {
          text = await generateForAngle(angleIndex);
        } catch (error) {
          console.warn("Roast generation failed", error);
          break; // model/network problem — stop trying
        }
        if (isUsable(text)) {
          chosenText = text;
          chosenAnimation =
            ROAST_ANGLE_ANIMATIONS[angleIndex % ROAST_ANGLE_ANIMATIONS.length];
        }
      }
    }

    // Keep the local model warm for fast follow-ups, then unload once quiet —
    // not a memory hog at rest, but not reloading ~5GB every minute either.
    if (!useCloudRef.current) {
      if (unloadTimerRef.current) {
        window.clearTimeout(unloadTimerRef.current);
      }
      unloadTimerRef.current = window.setTimeout(() => {
        electronAi.destroy().catch(() => {});
        modelWarmRef.current = false;
        roastsThisSessionRef.current = 0;
      }, KEEP_WARM_MS);
    }

    // Nothing worth saying this round? Stay SILENT rather than drop a stale,
    // generic line — "speak only when you have something." Release the
    // scheduler's gate (via an empty "spoken" signal) and show no bubble.
    if (!chosenText) {
      setStatus("idle");
      setIsBubbleOpen(false);
      try {
        clippyApi.roastSpoken("");
      } catch {
        // best-effort
      }
      return;
    }

    if (!chosenAnimation) {
      chosenAnimation =
        TALK_ANIMATIONS[Math.floor(Math.random() * TALK_ANIMATIONS.length)];
    }

    // No drunkify slur — the dark, lucid wit should stand clean.
    setAnimationKey(chosenAnimation);
    setSpokenText(chosenText);
    setStatus("responding");
    setIsBubbleOpen(true);
    if (soundEnabledRef.current) {
      playPopSound();
    }

    // Remember the line so he never repeats himself.
    try {
      clippyApi.roastSpoken(chosenText);
    } catch {
      // memory is best-effort
    }

    if (dismissTimerRef.current) {
      window.clearTimeout(dismissTimerRef.current);
    }
    dismissTimerRef.current = window.setTimeout(() => {
      setIsBubbleOpen(false);
      setStatus("idle");
    }, readingTimeMs(chosenText));
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
    if (settings.appliedDefaultModel === DEFAULT_MODEL_NAME) {
      return;
    }

    if (models[DEFAULT_MODEL_NAME]?.downloaded) {
      clippyApi.setState("settings.selectedModel", DEFAULT_MODEL_NAME);
      clippyApi.setState("settings.appliedDefaultModel", DEFAULT_MODEL_NAME);
    }
  }, [models, settings.appliedDefaultModel]);

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
