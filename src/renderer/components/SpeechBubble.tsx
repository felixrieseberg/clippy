import { useChat } from "../contexts/ChatContext";
import "./css/SpeechBubble.css";

/**
 * The pale-yellow balloon Clippy slurs his unsolicited opinions into.
 */
export function SpeechBubble({ text }: { text: string }) {
  const { status } = useChat();
  const display = status === "thinking" && !text ? "…" : text || "…";

  return (
    <div className="clippy-bubble-root app-no-drag">
      <div className="clippy-bubble">
        <p className="clippy-bubble__text">{display}</p>
      </div>
    </div>
  );
}
