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
  ROAST_ANGLES,
  ROAST_ANGLE_ANIMATIONS,
  ROAST_CRITIC_SYSTEM_PROMPT,
} from "../../sharedState";
import { DEFAULT_MODEL_NAME } from "../../models";
import { RoastContext } from "../../ipc-messages";
import {
  getFallbackLine,
  looksLikeJunk,
  trimToRoast,
  TALK_ANIMATIONS,
} from "../clippy-lines";

import type {
  LanguageModelPrompt,
  LanguageModelCreateOptions,
} from "@electron/llm";

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
const PER_CANDIDATE_TIMEOUT_MS = 5_000;
const CRITIC_TIMEOUT_MS = 4_000;
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
 * Run a single generation against a freshly-reset session and return the raw
 * text. Aborts (and returns what it has) after `timeoutMs`.
 */
async function generateOnce(
  options: LanguageModelCreateOptions,
  prompt: string,
  timeoutMs: number,
): Promise<string> {
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
    await electronAi.create(options);
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
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  useEffect(() => {
    modelLoadedRef.current = isModelLoaded;
  }, [isModelLoaded]);
  useEffect(() => {
    soundEnabledRef.current = settings.soundEnabled !== false;
  }, [settings.soundEnabled]);

  const getSystemPrompt = useCallback(() => {
    return settings.systemPrompt.replace(
      "[LIST OF ANIMATIONS]",
      ANIMATION_KEYS_BRACKETS.join(", "),
    );
  }, [settings.systemPrompt]);

  const loadModel = useCallback(
    async (initialPrompts: LanguageModelPrompt[] = []) => {
      setIsModelLoaded(false);

      const options: LanguageModelCreateOptions = {
        modelAlias: settings.selectedModel,
        systemPrompt: getSystemPrompt(),
        topK: settings.topK,
        temperature: settings.temperature,
        initialPrompts,
      };

      try {
        await electronAi.create(options);
        createOptionsRef.current = options;
        setIsModelLoaded(true);
      } catch (error) {
        console.error("Failed to load model", error);
      }
    },
    [
      settings.selectedModel,
      settings.systemPrompt,
      settings.topK,
      settings.temperature,
    ],
  );

  const roast = useCallback(async (context?: RoastContext) => {
    // Don't heckle if the model isn't ready or he's mid-thought.
    if (!modelLoadedRef.current) return;
    if (
      statusRef.current === "thinking" ||
      statusRef.current === "responding"
    ) {
      return;
    }

    const ctx = context || {};
    const recentLines = ctx.recentLines || [];

    // Pop the bubble open right away with a "thinking" beat so he feels
    // responsive while the writers' room does its thing. (The sound waits until
    // the actual line lands, below.)
    setSpokenText("");
    setAnimationKey("Thinking");
    setStatus("thinking");
    setIsBubbleOpen(true);

    let chosenText = "";
    let chosenAnimation = "";
    const baseOptions = createOptionsRef.current;

    if (baseOptions) {
      // Generate candidates from a few DIFFERENT comedic angles, each on a
      // fresh session (no drift), keeping only the ones that are in-character
      // and not something he's said before.
      const angles = shuffle([...ROAST_ANGLES.keys()]).slice(0, CANDIDATE_COUNT);
      const kept: Array<{ text: string; animation: string }> = [];
      const keptText: string[] = [];

      for (const angleIndex of angles) {
        const prompt = buildRoastPrompt({ ...ctx, recentLines }, angleIndex);
        const raw = await generateOnce(
          { ...baseOptions, temperature: CANDIDATE_TEMPERATURE },
          prompt,
          PER_CANDIDATE_TIMEOUT_MS,
        );

        const text = trimToRoast(raw);
        if (!text || looksLikeJunk(text)) continue;
        if (!isNovel(text, [...recentLines, ...keptText])) continue;

        kept.push({
          text,
          animation:
            ROAST_ANGLE_ANIMATIONS[angleIndex % ROAST_ANGLE_ANIMATIONS.length],
        });
        keptText.push(text);
      }

      if (kept.length === 1) {
        chosenText = kept[0].text;
        chosenAnimation = kept[0].animation;
      } else if (kept.length > 1) {
        // Critic pass: a sober, ruthless editor picks the truest, sharpest line.
        let winner = kept[0];
        const criticRaw = await generateOnce(
          {
            ...baseOptions,
            systemPrompt: ROAST_CRITIC_SYSTEM_PROMPT,
            temperature: 0.2,
          },
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

    // Only if the model gave us nothing usable do we reach for a hand-written
    // line — and even then we try to pick one he hasn't used recently.
    if (!chosenText) {
      let fallback = getFallbackLine(ctx);
      for (let i = 0; i < 4 && !isNovel(fallback.text, recentLines); i++) {
        fallback = getFallbackLine(ctx);
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

    if (dismissTimerRef.current) {
      window.clearTimeout(dismissTimerRef.current);
    }
    dismissTimerRef.current = window.setTimeout(() => {
      setIsBubbleOpen(false);
      setStatus("idle");
    }, readingTimeMs(spoken));
  }, []);

  // Load the model when the selected model or generation settings change.
  useEffect(() => {
    if (debug?.simulateDownload) {
      setIsModelLoaded(true);
      return;
    }

    if (settings.selectedModel) {
      loadModel();
    } else if (!settings.selectedModel && isModelLoaded) {
      electronAi
        .destroy()
        .then(() => setIsModelLoaded(false))
        .catch((error) => console.error(error));
    }
  }, [
    settings.selectedModel,
    settings.systemPrompt,
    settings.topK,
    settings.temperature,
  ]);

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
