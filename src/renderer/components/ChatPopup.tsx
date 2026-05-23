import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import "./css/ModernTheme.css";

import { useChat } from "../contexts/ChatContext";
import { useSharedState } from "../contexts/SharedStateContext";
import { electronAi } from "../clippyApi";
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

// ─── Animation key filter (same logic as original Chat.tsx) ──────────────────
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  // Focus textarea when popup opens
  useEffect(() => {
    if (isChatWindowOpen) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [isChatWindowOpen]);

  // Abort running request
  const handleAbort = () => {
    electronAi.abortRequest(lastUUID);
  };

  // Send message
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

  return (
    <div className={`chat-popup ${isChatWindowOpen ? "open" : ""}`}>
      <div className="chat-popup-inner">
        {/* Header */}
        <div className="chat-header">
          <div className="chat-header-title">
            <span className="dot" />
            Chat with Clippy
          </div>
          <div className="chat-header-actions">
            <button
              className="chat-close-btn"
              onClick={() => setIsChatWindowOpen(false)}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Messages */}
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

          {/* Streaming response */}
          {status === "responding" && streaming && (
            <div className="msg-row clippy">
              <img
                className="msg-avatar"
                src={defaultClippy}
                alt="Clippy"
              />
              <div className="msg-bubble">
                <ReactMarkdown>{streaming}</ReactMarkdown>
              </div>
            </div>
          )}

          {/* Thinking dots */}
          {status === "thinking" && (
            <div className="msg-row clippy">
              <img
                className="msg-avatar"
                src={defaultClippy}
                alt="Clippy"
              />
              <div className="msg-bubble">
                <div className="typing-dots">
                  <span /><span /><span />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
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
                ? "Waiting for model to load..."
                : isBusy
                ? "Clippy is thinking..."
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
      </div>
    </div>
  );
}
