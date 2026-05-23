import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import "./css/ModernTheme.css";

import { useChat } from "../contexts/ChatContext";
import { useSharedState } from "../contexts/SharedStateContext";
import { electronAi, clippyApi } from "../clippyApi";
import { ANIMATION_KEYS_BRACKETS } from "../clippy-animation-helpers";
import questionIcon from "../images/icons/question.png";
import defaultClippy from "../images/animations/Default.png";
import { Message } from "./Message";

// ─── Cloud streaming helper ───────────────────────────────────────────────────
async function* streamCloudAPI(
  provider: string,
  apiKey: string,
  message: string,
  systemPrompt?: string,
) {
  const url =
    provider === "openrouter"
      ? "https://openrouter.ai/api/v1/chat/completions"
      : "https://api.x.ai/v1/chat/completions";

  const model =
    provider === "openrouter"
      ? "meta-llama/llama-3-8b-instruct:free"
      : "grok-beta";

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(provider === "openrouter" && {
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "Clippy",
      }),
    },
    body: JSON.stringify({
      model,
      messages: [
        ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
        { role: "user", content: message },
      ],
      stream: true,
    }),
  });

  if (!resp.ok) throw new Error(`API Error: ${resp.statusText}`);

  const reader = resp.body?.getReader();
  const decoder = new TextDecoder("utf-8");
  if (!reader) return;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split("\n").filter((l) => l.trim())) {
      if (line.replace(/^data: /, "") === "[DONE]") return;
      if (line.startsWith("data: ")) {
        try {
          const parsed = JSON.parse(line.replace(/^data: /, ""));
          const text = parsed.choices?.[0]?.delta?.content;
          if (text) yield text;
        } catch {
          /* ignore */
        }
      }
    }
  }
}

// ─── Animation key filter ─────────────────────────────────────────────────────
function filterMessageContent(content: string): {
  text: string;
  animationKey: string;
} {
  let text = content;
  let animationKey = "";
  if (content === "[") {
    text = "";
  } else if (/^\[[A-Za-z]*$/m.test(content)) {
    text = content.replace(/^\[[A-Za-z]*$/m, "").trim();
  } else {
    for (const key of ANIMATION_KEYS_BRACKETS) {
      if (content.startsWith(key)) {
        animationKey = key.slice(1, -1);
        text = content.slice(key.length).trim();
        break;
      }
    }
  }
  return { text, animationKey };
}

// ─── Inline mini-settings panel ───────────────────────────────────────────────
function MiniSettings({ onClose }: { onClose: () => void }) {
  const { settings } = useSharedState();

  const provider = settings.provider || "local";

  return (
    <div className="mini-settings">
      <div className="mini-settings-header">
        <span>⚙ Quick Settings</span>
        <button className="mini-settings-close" onClick={onClose}>✕</button>
      </div>

      <label className="mini-settings-row">
        <span>AI Provider</span>
        <select
          value={provider}
          onChange={(e) => clippyApi.setState("settings.provider", e.target.value)}
        >
          <option value="local">Local (Llama.cpp)</option>
          <option value="openrouter">OpenRouter</option>
          <option value="xai">xAI (Grok)</option>
        </select>
      </label>

      {provider === "openrouter" && (
        <label className="mini-settings-row">
          <span>OpenRouter Key</span>
          <input
            type="password"
            value={settings.openRouterApiKey || ""}
            onChange={(e) => clippyApi.setState("settings.openRouterApiKey", e.target.value)}
            placeholder="sk-or-v1-..."
          />
        </label>
      )}

      {provider === "xai" && (
        <label className="mini-settings-row">
          <span>xAI Key</span>
          <input
            type="password"
            value={settings.xAiApiKey || ""}
            onChange={(e) => clippyApi.setState("settings.xAiApiKey", e.target.value)}
            placeholder="xai-..."
          />
        </label>
      )}

      <p className="mini-settings-hint">
        💡 Ctrl+Click on Clippy for full settings
      </p>
    </div>
  );
}

// ─── Smart screen-aware popup position hook ──────────────────────────────────
function usePopupPosition() {
  const [pos, setPos] = useState({ right: 10, bottom: 110, left: "auto" as "auto" | number });

  useEffect(() => {
    const POPUP_W = 350;
    const POPUP_H = 540;
    const MARGIN  = 12;

    const compute = () => {
      const winX = window.screenX;
      const winY = window.screenY;
      const winW = window.outerWidth;  // main Electron window width
      const winH = window.outerHeight;
      const screenW = screen.width;
      const screenH = screen.height;

      // Horizontal: does popup fit to the LEFT of clippy inside the window?
      // Popup sits inside the window at right:10 → its left edge is at
      // screenX + (winW - POPUP_W - 10). If that < 0, flip to right:auto left:10.
      const popupScreenLeft = winX + winW - POPUP_W - MARGIN;
      const flipH = popupScreenLeft < 0;

      // Vertical: does popup fit ABOVE clippy?
      // Popup bottom edge is at screenY + winH - 110.
      // Its top edge would be at screenY + winH - 110 - POPUP_H.
      // If top < 0 → flip downward (but we can't go below screen either).
      const popupScreenTop = winY + winH - 110 - POPUP_H;
      const flipV = popupScreenTop < 0;

      setPos({
        right:  flipH ? "auto" as any : MARGIN,
        left:   flipH ? MARGIN : "auto",
        bottom: flipV ? "auto" as any : 110,
      });
    };

    compute();
    window.addEventListener("resize",   compute);
    window.addEventListener("focus",    compute);  // triggers when window moves
    const id = setInterval(compute, 500); // poll while open for drag
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("focus",  compute);
      clearInterval(id);
    };
  }, []);

  return pos;
}

// ─── Main component ───────────────────────────────────────────────────────────
export function ChatPopup() {
  const {
    isChatWindowOpen,
    setIsChatWindowOpen,
    setAnimationKey,
    status,
    setStatus,
    messages,
    addMessage,
    isModelLoaded,
  } = useChat();
  const { settings } = useSharedState();

  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState("");
  const [lastUUID, setLastUUID] = useState(crypto.randomUUID());
  const [showSettings, setShowSettings] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const popupPos = usePopupPosition();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  useEffect(() => {
    if (isChatWindowOpen && !showSettings) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [isChatWindowOpen, showSettings]);

  const handleAbort = () => electronAi.abortRequest(lastUUID);

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || status !== "idle") return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      content: msg,
      sender: "user",
      createdAt: Date.now(),
    };
    await addMessage(userMsg);
    setInput("");
    setStreaming("");
    setStatus("thinking");

    try {
      const uuid = crypto.randomUUID();
      setLastUUID(uuid);

      let response;
      if (settings.provider === "openrouter" && settings.openRouterApiKey) {
        response = streamCloudAPI(
          "openrouter",
          settings.openRouterApiKey,
          msg,
          settings.systemPrompt,
        );
      } else if (settings.provider === "xai" && settings.xAiApiKey) {
        response = streamCloudAPI(
          "xai",
          settings.xAiApiKey,
          msg,
          settings.systemPrompt,
        );
      } else {
        response = await window.electronAi.promptStreaming(msg, {
          requestUUID: uuid,
        });
      }

      let full = "";
      let filtered = "";
      let hasAnim = false;

      for await (const chunk of response) {
        if (full === "") setStatus("responding");
        if (!hasAnim) {
          const { text, animationKey } = filterMessageContent(full + chunk);
          filtered = text;
          full += chunk;
          if (animationKey) {
            setAnimationKey(animationKey);
            hasAnim = true;
          }
        } else {
          filtered += chunk;
        }
        setStreaming(filtered);
      }

      addMessage({
        id: crypto.randomUUID(),
        content: filtered,
        sender: "clippy",
        createdAt: Date.now(),
      });
    } catch {
      addMessage({
        id: crypto.randomUUID(),
        content: "Oops! Something went wrong.",
        sender: "clippy",
        createdAt: Date.now(),
      });
    } finally {
      setStreaming("");
      setStatus("idle");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isDisabled = !isModelLoaded && settings.provider === "local";
  const isBusy = status !== "idle";
  const providerLabel = {
    local: "🖥 Local",
    openrouter: "🌐 OpenRouter",
    xai: "🤖 xAI",
  }[settings.provider || "local"];

  return (
    <div
      className={`chat-popup ${isChatWindowOpen ? "open" : ""}`}
      style={{ right: popupPos.right, left: popupPos.left, bottom: popupPos.bottom }}
    >
      <div className="chat-popup-inner">

        {/* ── Header ── */}
        <div className="chat-header">
          <div className="chat-header-title">
            <span className="dot" />
            Chat with Clippy
            <span className="provider-badge">{providerLabel}</span>
          </div>
          <div className="chat-header-actions">
            <button
              className={showSettings ? "chat-settings-btn active" : "chat-settings-btn"}
              onClick={() => setShowSettings((s) => !s)}
              title="Quick settings"
            >
              ⚙
            </button>
            <button
              className="chat-close-btn"
              onClick={() => setIsChatWindowOpen(false)}
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── Mini settings panel (slides in) ── */}
        {showSettings && (
          <MiniSettings onClose={() => setShowSettings(false)} />
        )}

        {/* ── Messages ── */}
        {!showSettings && (
          <>
            <div className="chat-messages">
              {messages.map((m) => (
                <div key={m.id} className={`msg-row ${m.sender}`}>
                  <img
                    className="msg-avatar"
                    src={m.sender === "user" ? questionIcon : defaultClippy}
                    alt={m.sender}
                  />
                  <div className="msg-bubble">
                    <ReactMarkdown
                      components={{
                        a: ({ node, ...props }) => (
                          <a target="_blank" rel="noopener noreferrer" {...props} />
                        ),
                      }}
                    >
                      {m.content}
                    </ReactMarkdown>
                  </div>
                </div>
              ))}

              {status === "responding" && streaming && (
                <div className="msg-row clippy">
                  <img className="msg-avatar" src={defaultClippy} alt="Clippy" />
                  <div className="msg-bubble">
                    <ReactMarkdown>{streaming}</ReactMarkdown>
                  </div>
                </div>
              )}

              {status === "thinking" && (
                <div className="msg-row clippy">
                  <img className="msg-avatar" src={defaultClippy} alt="Clippy" />
                  <div className="msg-bubble">
                    <div className="typing-dots">
                      <span /><span /><span />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* ── Input ── */}
            <div className="chat-input-area">
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isDisabled || isBusy}
                placeholder={
                  isDisabled
                    ? "Waiting for model to load…"
                    : isBusy
                    ? "Clippy is thinking…"
                    : "Type a message…"
                }
              />
              <button
                className="chat-send-btn"
                disabled={isDisabled}
                onClick={isBusy ? handleAbort : handleSend}
                title={isBusy ? "Abort" : "Send"}
              >
                {isBusy ? "■" : "➤"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
