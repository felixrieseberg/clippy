import React from "react";
import { useBubbleView } from "../contexts/BubbleViewContext";
import { useSharedState } from "../contexts/SharedStateContext";
import { Progress } from "./Progress";
import { isModelDownloading, isModelReady } from "../../helpers/model-helpers";
import { prettyDownloadSpeed } from "../helpers/convert-download-speed";

export const WelcomeMessageContent: React.FC = () => {
  const { setCurrentView } = useBubbleView();
  const { models } = useSharedState();

  // Find if any model is currently downloading
  const downloadingModel = Object.values(models || {}).find(isModelDownloading);
  // Check if any model is ready
  const readyModel = Object.values(models || {}).find(isModelReady);

  return (
    <div>
      <strong>Welcome to Clippy!</strong>
      <p>
        This little app is a love letter and homage to the late, great Clippy,
        the assistant from Microsoft Office 1997. The character was designed by
        illustrator Kevan Atteberry, who created more than 15 potential
        characters for Microsoft's Office Assistants. It is <i>not</i>{" "}
        affiliated, approved, or supported by Microsoft. Consider it software
        art or satire.
      </p>
      <p>
        This version of Clippy can run a Large Language Model (LLM) locally, so
        that you can chat with it offline.
      </p>
      <p>
        It supports a variety of models, including Google's Gemma3, Meta's
        Llama3, or Microsoft's Phi-4 Mini. We've already started downloading the
        smallest model for you in the background. You can choose a bigger, more
        powerful model in the settings.
      </p>
      <p>
        By the way, you can open or close this chat window by clicking right on
        Clippy's head.
      </p>

      {downloadingModel && (
        <div style={{ marginTop: "15px", marginBottom: "15px" }}>
          <p>
            Downloading {downloadingModel.name}... (
            {prettyDownloadSpeed(
              downloadingModel.downloadState?.currentBytesPerSecond || 0,
            )}
            /s)
          </p>
          <Progress
            progress={downloadingModel.downloadState?.percentComplete || 0}
          />
        </div>
      )}

      {!downloadingModel && readyModel && (
        <div style={{ marginTop: "15px", marginBottom: "15px" }}>
          <p style={{ color: "green", fontWeight: "bold" }}>
            ✓ {readyModel.name} is ready! You can now start chatting with
            Clippy.
          </p>
        </div>
      )}

      <button onClick={() => setCurrentView("settings-appearance")}>
        Open Settings
      </button>
    </div>
  );
};
