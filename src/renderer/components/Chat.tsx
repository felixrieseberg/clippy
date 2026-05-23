import { useState } from "react";

import { Message } from "./Message";
import { ChatInput } from "./ChatInput";
import { ANIMATION_KEYS_BRACKETS } from "../clippy-animation-helpers";
import { useChat } from "../contexts/ChatContext";
import { electronAi } from "../clippyApi";

import { useSharedState } from "../contexts/SharedStateContext";

async function* streamCloudAPI(provider: string, apiKey: string, message: string, systemPrompt?: string) {
  const url = provider === "openrouter" 
    ? "https://openrouter.ai/api/v1/chat/completions" 
    : "https://api.x.ai/v1/chat/completions";
  
  const model = provider === "openrouter" ? "meta-llama/llama-3-8b-instruct:free" : "grok-beta";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(provider === "openrouter" && { "HTTP-Referer": "http://localhost:5173", "X-Title": "Clippy" })
    },
    body: JSON.stringify({
      model: model,
      messages: [
        ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
        { role: "user", content: message }
      ],
      stream: true
    })
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder("utf-8");

  if (!reader) return;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split("\n").filter(line => line.trim() !== "");
    for (const line of lines) {
      if (line.replace(/^data: /, "") === "[DONE]") {
        return;
      }
      if (line.startsWith("data: ")) {
        try {
          const parsed = JSON.parse(line.replace(/^data: /, ""));
          if (parsed.choices?.[0]?.delta?.content) {
            yield parsed.choices[0].delta.content;
          }
        } catch (e) {
          // ignore
        }
      }
    }
  }
}

export type ChatProps = {
  style?: React.CSSProperties;
};

export function Chat({ style }: ChatProps) {
  const { setAnimationKey, setStatus, status, messages, addMessage } = useChat();
  const { settings } = useSharedState();
  const [streamingMessageContent, setStreamingMessageContent] = useState<string>("");
  const [lastRequestUUID, setLastRequestUUID] = useState<string>(crypto.randomUUID());

  const handleAbortMessage = () => {
    electronAi.abortRequest(lastRequestUUID);
  };

  const handleSendMessage = async (message: string) => {
    if (status !== "idle") {
      return;
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      content: message,
      sender: "user",
      createdAt: Date.now(),
    };

    await addMessage(userMessage);
    setStreamingMessageContent("");
    setStatus("thinking");

    try {
      const requestUUID = crypto.randomUUID();
      setLastRequestUUID(requestUUID);

      let response;
      if (settings.provider === "openrouter" && settings.openRouterApiKey) {
        response = streamCloudAPI("openrouter", settings.openRouterApiKey, message, settings.systemPrompt);
      } else if (settings.provider === "xai" && settings.xAiApiKey) {
        response = streamCloudAPI("xai", settings.xAiApiKey, message, settings.systemPrompt);
      } else {
        response = await window.electronAi.promptStreaming(message, { requestUUID });
      }

      let fullContent = "";
      let filteredContent = "";
      let hasSetAnimationKey = false;

      for await (const chunk of response) {
        if (fullContent === "") {
          setStatus("responding");
        }

        if (!hasSetAnimationKey) {
          const { text, animationKey } = filterMessageContent(fullContent + chunk);

          filteredContent = text;
          fullContent = fullContent + chunk;

          if (animationKey) {
            setAnimationKey(animationKey);
            hasSetAnimationKey = true;
          }
        } else {
          filteredContent += chunk;
        }

        setStreamingMessageContent(filteredContent);
      }

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        content: filteredContent,
        sender: "clippy",
        createdAt: Date.now(),
      };

      addMessage(assistantMessage);
    } catch (error) {
      console.error(error);
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        content: "Oops! Something went wrong communicating with the API.",
        sender: "clippy",
        createdAt: Date.now(),
      };
      addMessage(errorMessage);
    } finally {
      setStreamingMessageContent("");
      setStatus("idle");
    }
  };

  return (
    <div style={style} className="chat-container">
      {messages.map((message) => (
        <Message key={message.id} message={message} />
      ))}
      {status === "responding" && (
        <Message
          message={{
            id: "streaming",
            content: streamingMessageContent,
            sender: "clippy",
            createdAt: Date.now(),
          }}
        />
      )}
      <ChatInput onSend={handleSendMessage} onAbort={handleAbortMessage} />
    </div>
  );
}

/**
 * Filter the message content to get the text and animation key
 *
 * @param content - The content of the message
 * @returns The text and animation key
 */
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
    // Check for animation keys in brackets
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
