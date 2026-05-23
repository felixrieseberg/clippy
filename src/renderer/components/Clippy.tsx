import { useEffect, useState, useCallback, useRef } from "react";

import { ANIMATIONS, Animation } from "../clippy-animations";
import {
  EMPTY_ANIMATION,
  getRandomIdleAnimation,
} from "../clippy-animation-helpers";
import { useChat } from "../contexts/ChatContext";
import { log } from "../logging";
import { useDebugState } from "../contexts/DebugContext";
import { clippyApi } from "../clippyApi";

const WAIT_TIME = 6000;

export function Clippy() {
  const {
    animationKey,
    status,
    setStatus,
    setIsChatWindowOpen,
    isChatWindowOpen,
  } = useChat();
  const { enableDragDebug } = useDebugState();
  const [animation, setAnimation] = useState<Animation>(EMPTY_ANIMATION);
  const animationTimeoutRef = useRef<number | undefined>(undefined); // for play/reset
  const idleTimerRef = useRef<number | undefined>(undefined);        // exclusively for idle loop
  const statusRef = useRef(status);
  statusRef.current = status;

  const clearAnimationTimeout = useCallback(() => {
    if (animationTimeoutRef.current !== undefined) {
      window.clearTimeout(animationTimeoutRef.current);
      animationTimeoutRef.current = undefined;
    }
  }, []);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current !== undefined) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = undefined;
    }
  }, []);

  const playAnimation = useCallback((key: string) => {
    const anim = ANIMATIONS[key as keyof typeof ANIMATIONS];
    if (anim) {
      log(`Playing animation`, { key });
      clearAnimationTimeout();
      setAnimation(anim);
      animationTimeoutRef.current = window.setTimeout(() => {
        animationTimeoutRef.current = undefined;
        setAnimation(ANIMATIONS.Default);
      }, anim.length + 200);
    } else {
      log(`Animation not found`, { key });
    }
  }, [clearAnimationTimeout]);

  // Idle loop — uses its own dedicated timer so playAnimation can never kill it
  const idleLoopRef = useRef<() => void>(() => {});

  idleLoopRef.current = () => {
    if (statusRef.current !== "idle") return;
    const idleAnim = getRandomIdleAnimation();
    setAnimation(idleAnim);
    idleTimerRef.current = window.setTimeout(() => {
      if (statusRef.current !== "idle") return;
      setAnimation(ANIMATIONS.Default);
      idleTimerRef.current = window.setTimeout(() => {
        idleLoopRef.current();
      }, WAIT_TIME);
    }, idleAnim.length);
  };

  const toggleChat = useCallback((e: React.MouseEvent) => {
    if (e.ctrlKey) {
      clippyApi.toggleChatWindow();
      return;
    }
    setIsChatWindowOpen(!isChatWindowOpen);
  }, [isChatWindowOpen, setIsChatWindowOpen]);

  // React to status changes
  useEffect(() => {
    if (status === "welcome" && animation === EMPTY_ANIMATION) {
      setAnimation(ANIMATIONS.Show);
      setTimeout(() => {
        setStatus("idle");
      }, ANIMATIONS.Show.length + 200);

    } else if (status === "idle") {
      clearAnimationTimeout();
      setAnimation(ANIMATIONS.Default);
      clearIdleTimer();
      idleTimerRef.current = window.setTimeout(() => {
        idleLoopRef.current();
      }, WAIT_TIME);

    } else if (status === "thinking") {
      clearIdleTimer();
      clearAnimationTimeout();
      playAnimation("Processing");

    } else if (status === "responding") {
      clearIdleTimer();
      clearAnimationTimeout();
      setAnimation(ANIMATIONS.Default);
    }
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Play AI-chosen animation when animationKey changes
  useEffect(() => {
    if (!animationKey) return;
    const key = animationKey.split(":")[0];
    log(`New animation key`, { key });
    playAnimation(key); // safe — only clears animationTimeoutRef, never idleTimerRef
  }, [animationKey, playAnimation]);

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      clearAnimationTimeout();
      clearIdleTimer();
    };
  }, [clearAnimationTimeout, clearIdleTimer]);

  return (
    <div onContextMenu={clippyApi.popupAppMenu}>
      <div
        className="app-drag"
        style={{
          position: "absolute",
          height: "93px",
          width: "124px",
          backgroundColor: enableDragDebug ? "blue" : "transparent",
          opacity: 0.5,
          zIndex: 5,
        }}
      >
        <div
          className="app-no-drag"
          style={{
            position: "absolute",
            height: "80px",
            width: "45px",
            backgroundColor: enableDragDebug ? "red" : "transparent",
            zIndex: 10,
            right: "40px",
            top: "2px",
            cursor: "help",
          }}
          onClick={toggleChat}
          title="Click to chat • Ctrl+Click for settings"
        ></div>
      </div>
      <img
        className="app-no-select"
        src={animation.src}
        draggable={false}
        alt="Clippy"
      />
    </div>
  );
}
