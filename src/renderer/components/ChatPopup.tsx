import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import "./css/ModernTheme.css";

import { useChat } from "../contexts/ChatContext";
import { useSharedState } from "../contexts/SharedStateContext";
import { useBubbleView } from "../contexts/BubbleViewContext";
import { Settings } from "./Settings";
import { electronAi, clippyApi } from "../clippyApi";
import { ANIMATION_KEYS_BRACKETS } from "../clippy-animation-helpers";
import questionIcon from "../images/icons/question.png";
import defaultClippy from "../images/animations/Default.png";
import { Message } from "./Message";

// ─── Cloud streaming helper ───────────────────────────────────────────────────
async function* streamCloudAPI(
  provider: string,
  apiKey: string,
  messages: Message[],
  systemPrompt?: string,
) {
  const url =
    provider === "openrouter"
      ? "https://openrouter.ai/api/v1/chat/completions"
      : "https://api.x.ai/v1/chat/completions";

  const model =
    provider === "openrouter"
      ? "nvidia/nemotron-3-super-120b-a12b:free"
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
        ...messages.map((m) => ({
          role: m.sender === "clippy" ? "assistant" : "user",
          content: m.content || "",
        })),
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

  // 1. Check if the string contains any fully formed valid animation keys
  for (const key of ANIMATION_KEYS_BRACKETS) {
    const idx = text.indexOf(key);
    if (idx !== -1) {
      animationKey = key.slice(1, -1);
      // Remove the key from the text
      text = text.replace(key, "").trimStart();
      break;
    }
  }

  // 2. If we haven't found a fully formed key yet, we might be mid-stream
  // Hide any incomplete bracket tags at the very end of the string to prevent flickering
  if (!animationKey) {
    const partialMatch = text.match(/\[[A-Za-z]*$/);
    if (partialMatch) {
      text = text.slice(0, partialMatch.index);
    }
  }

  return { text, animationKey };
}

// ─── Sentiment → animation fallback ─────────────────────────────────────────
const SENTIMENT_MAP: Array<{ keywords: string[]; animation: string }> = [
  { keywords: ["hello", "hi", "hey", "howdy", "greetings"], animation: "Wave" },
  { keywords: ["bye", "goodbye", "farewell", "see you", "take care"], animation: "GoodBye" },
  { keywords: ["congrat", "well done", "great job", "awesome", "excellent", "fantastic", "amazing"], animation: "Congratulate" },
  { keywords: ["search", "look up", "find", "browse", "scan"], animation: "Searching" },
  { keywords: ["think", "consider", "analyz", "evaluat", "let me", "hmm", "interesting"], animation: "Thinking" },
  { keywords: ["explain", "here is", "here's", "let me tell", "to understand", "basically", "in short"], animation: "Explain" },
  { keywords: ["code", "function", "variable", "programming", "typescript", "javascript", "python", "algorithm"], animation: "GetTechy" },
  { keywords: ["wizard", "magic", "trick", "spell", "enchant", "mystical"], animation: "GetWizardy" },
  { keywords: ["art", "design", "creative", "draw", "color", "paint", "aesthetic"], animation: "GetArtsy" },
  { keywords: ["error", "warning", "problem", "issue", "fail", "broken", "crash", "bug"], animation: "Alert" },
  { keywords: ["save", "store", "persist", "write to", "export"], animation: "Save" },
  { keywords: ["send", "email", "mail", "message", "deliver"], animation: "SendMail" },
  { keywords: ["print", "output", "render", "display"], animation: "Print" },
  { keywords: ["delete", "remove", "trash", "clear", "clean up", "empty"], animation: "EmptyTrash" },
  { keywords: ["processing", "calculating", "computing", "loading", "working on"], animation: "Processing" },
  { keywords: ["writing", "write", "draft", "compose", "document"], animation: "Writing" },
  { keywords: ["hear", "listen", "audio", "sound", "music"], animation: "Hearing_1" },
];

function sentimentAnimation(text: string): string {
  const lower = text.toLowerCase();
  let result = "Explain"; // default fallback
  for (const { keywords, animation } of SENTIMENT_MAP) {
    const matchedKw = keywords.find((kw) => {
      if (kw.length <= 5) {
        return new RegExp(`\\b${kw}\\b`).test(lower);
      }
      return lower.includes(kw);
    });
    if (matchedKw) {
      result = animation;
      break;
    }
  }
  return result;
}

function MiniSettings({ onClose }: { onClose: () => void }) {
  const { settings } = useSharedState();
  const { setCurrentView } = useBubbleView();

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

      <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
        <button
          onClick={() => {
            setCurrentView("settings-general");
            onClose();
          }}
          style={{
            flex: 1,
            background: "rgba(99, 102, 241, 0.2)",
            border: "1px solid rgba(99, 102, 241, 0.4)",
            borderRadius: "6px",
            color: "#a78bfa",
            padding: "6px",
            fontSize: "11px",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          ⚙ Open Full Settings
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function ChatPopup({ layout }: { layout: "right" | "left" | "top-right" | "top-left" }) {
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
  const { currentView, setCurrentView } = useBubbleView();
  const { settings } = useSharedState();

  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState("");
  const [lastUUID, setLastUUID] = useState(crypto.randomUUID());
  const [showSettings, setShowSettings] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    // Set animation immediately based on the user's message — short, clear, unambiguous
    setAnimationKey(sentimentAnimation(msg) + ":" + Date.now());

    try {
      const uuid = crypto.randomUUID();
      setLastUUID(uuid);

      let response;
      const currentMessages = [...messages, userMsg];
      const resolvedSystemPrompt = settings.systemPrompt.replace(
        "[LIST OF ANIMATIONS]",
        ANIMATION_KEYS_BRACKETS.join(", ")
      );

      if (settings.provider === "openrouter" && settings.openRouterApiKey) {
        response = streamCloudAPI(
          "openrouter",
          settings.openRouterApiKey,
          currentMessages,
          resolvedSystemPrompt,
        );
      } else if (settings.provider === "xai" && settings.xAiApiKey) {
        response = streamCloudAPI(
          "xai",
          settings.xAiApiKey,
          currentMessages,
          resolvedSystemPrompt,
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

      // If the AI output its own animation tag, that already fired above.
      // If not, fall back to scanning the AI response as a secondary signal.
      if (!hasAnim && filtered) {
        const responseAnim = sentimentAnimation(filtered);
        // Only override if different from what we already set from user message
        setAnimationKey(responseAnim + ":" + Date.now());
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
      className={`chat-popup ${isChatWindowOpen ? "open" : ""} layout-${layout}`}
    >
      <div className="chat-popup-inner" style={{ flex: 1 }}>
        {/* ── Header (Always Visible) ── */}
        <div className="chat-header">
          <div className="chat-header-title">
            <span className="dot" />
            {currentView.startsWith("settings") ? "Settings" : "Chat with Clippy"}
            {!currentView.startsWith("settings") && (
              <span className="provider-badge">{providerLabel}</span>
            )}
          </div>
          <div className="chat-header-actions">
            {!currentView.startsWith("settings") && (
              <button
                className={showSettings ? "chat-settings-btn active" : "chat-settings-btn"}
                onClick={() => setShowSettings(!showSettings)}
                title="Quick Settings"
              >
                ⚙
              </button>
            )}
            <button
              className="chat-close-btn"
              onClick={() => setIsChatWindowOpen(false)}
            >
              ✕
            </button>
          </div>
        </div>

        {currentView.startsWith("settings") ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "transparent", color: "white", minHeight: 0 }}>
            <Settings onClose={() => setCurrentView("chat")} />
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}
