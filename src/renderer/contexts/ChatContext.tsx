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
import {
  ANIMATION_KEYS_BRACKETS,
  parseAnimation,
} from "../clippy-animation-helpers";
import { drunkify } from "../../helpers/drunkify";
import { playPopSound } from "../helpers/sound";
import { buildRoastPrompt } from "../../sharedState";
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

// Give the (slow, local) model this long to produce a roast before we give up
// and drop in an instant hand-written line instead.
const GENERATION_TIMEOUT_MS = 6_000;

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

    // Pop the bubble open right away with a "thinking" beat so he feels
    // responsive even while the local model grinds away.
    setSpokenText("");
    setAnimationKey("Thinking");
    setStatus("thinking");
    setIsBubbleOpen(true);
    playPopSound();

    // Ask the model for a roast. Small local models are slow and frequently
    // refuse, ramble, or slip into helpful "assistant mode", so anything but a
    // clean one-liner falls back to a hand-written line — Clippy is never left
    // speechless.
    let modelOutput = "";
    const requestUUID = crypto.randomUUID();
    let timedOut = false;
    const genTimer = window.setTimeout(() => {
      timedOut = true;
      try {
        window.electronAi.abortRequest(requestUUID);
      } catch {
        // The request may not have started yet; ignore.
      }
    }, GENERATION_TIMEOUT_MS);

    try {
      // Reset the conversation to the system prompt only, so repeated roasts
      // don't accumulate context and drift into chatty meta-commentary.
      if (createOptionsRef.current) {
        await electronAi.create(createOptionsRef.current);
      }

      const prompt = buildRoastPrompt(context?.app, context?.title);
      const response = await window.electronAi.promptStreaming(prompt, {
        requestUUID,
      });

      for await (const chunk of response) {
        modelOutput += chunk;
        if (timedOut) break;
      }
    } catch (error) {
      console.error("Roast generation failed; falling back to a line", error);
    } finally {
      window.clearTimeout(genTimer);
    }

    const { text, animationKey: parsedKey } = parseAnimation(modelOutput);

    // Judge the raw output, then trim if good. If the model timed out or broke
    // character, drop in an instant hand-written line (which is app-aware, so
    // it's still contextual).
    let line: string;
    let animationKey = parsedKey;

    if (timedOut || looksLikeJunk(text)) {
      const fallback = getFallbackLine(context);
      line = fallback.text;
      animationKey = fallback.animation;
    } else {
      line = trimToRoast(text);
    }

    if (!animationKey) {
      animationKey =
        TALK_ANIMATIONS[Math.floor(Math.random() * TALK_ANIMATIONS.length)];
    }

    const spoken = drunkify(line);
    setAnimationKey(animationKey);
    setSpokenText(spoken);
    setStatus("responding");
    setIsBubbleOpen(true);

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
