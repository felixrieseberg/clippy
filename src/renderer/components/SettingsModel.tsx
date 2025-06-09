import { Column, TableView } from "./TableView";
import { Progress } from "./Progress";
import React, { useState } from "react";
import { useSharedState } from "../contexts/SharedStateContext";
import { clippyApi } from "../clippyApi";
import { prettyDownloadSpeed } from "../helpers/convert-download-speed";
import { ManagedModel } from "../../models";
import { isModelDownloading } from "../../helpers/model-helpers";
import React, { useState, useEffect } from "react";

export const SettingsModel: React.FC = () => {
  const { models, settings } = useSharedState();
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  // State for API configuration inputs
  const [provider, setProvider] = useState<string | undefined>("");
  const [apiBaseUrl, setApiBaseUrl] = useState<string | undefined>("");
  const [apiKey, setApiKey] = useState<string | undefined>("");
  const [modelName, setModelName] = useState<string | undefined>("");

  // State for "Add Remote Model" form
  const [isAddModelModalOpen, setIsAddModelModalOpen] = useState(false);
  const initialNewRemoteModelConfig: Partial<ManagedModel> = {
    name: "",
    provider: "",
    apiBaseUrl: "",
    modelName: "", // This is the model name for the API
    apiKey: "",
    description: "",
    company: "",
    homepage: "",
  };
  const [newRemoteModelConfig, setNewRemoteModelConfig] = useState<
    Partial<ManagedModel>
  >(initialNewRemoteModelConfig);
  const [formError, setFormError] = useState<string | null>(null);

  const columns: Array<Column> = [
    { key: "default", header: "Loaded", width: 50 },
    { key: "name", header: "Name" },
    {
      key: "size",
      header: "Size",
      render: (row: ManagedModel) =>
        row.provider === "gguf" && row.size
          ? `${row.size.toLocaleString()} MB`
          : "N/A",
    },
    { key: "company", header: "Company" },
    {
      key: "type",
      header: "Type",
      render: (row: ManagedModel) => {
        if (row.provider !== "gguf") {
          return "Remote API";
        }
        return row.downloaded ? "Local (Downloaded)" : "Local (Not Downloaded)";
      },
    },
  ];

  const modelKeys = Object.keys(models || {});
  const data = modelKeys.map((modelKey) => {
    const model = models?.[modelKey as keyof typeof models] as ManagedModel; // Cast for render functions

    return {
      // Spread model to ensure all properties are available for renderers
      ...model,
      default: model?.name === settings.selectedModel ? "ｘ" : "",
      // Ensure specific properties needed by TableView are directly accessible if not part of ManagedModel for some reason
      name: model?.name,
      company: model?.company,
      size: model?.size,
      downloaded: model.downloaded, // Keep for internal logic, though 'type' is displayed
      provider: model.provider, // Keep for internal logic
    };
  });

  // Variables
  const selectedModel =
    models?.[modelKeys[selectedIndex] as keyof typeof models] || null;
  const isDownloading = isModelDownloading(selectedModel);
  const isDefaultModel = selectedModel?.name === settings.selectedModel;

  // Effect to update local state when selectedModel changes
  useEffect(() => {
    if (selectedModel) {
      setProvider(selectedModel.provider);
      setApiBaseUrl(selectedModel.apiBaseUrl);
      setApiKey(selectedModel.apiKey);
      setModelName(selectedModel.modelName);
    } else {
      setProvider("");
      setApiBaseUrl("");
      setApiKey("");
      setModelName("");
    }
  }, [selectedModel]);

  // Handlers
  // ---------------------------------------------------------------------------
  const handleRowSelect = (index: number) => {
    setSelectedIndex(index);
  };

  const handleDownload = async () => {
    if (selectedModel) {
      await clippyApi.downloadModelByName(data[selectedIndex].name);
    }
  };

  const handleDeleteOrRemove = async () => {
    if (!selectedModel) return;

    if (selectedModel.provider !== "gguf") {
      await clippyApi.removeModelByName(selectedModel.name);
    } else {
      // GGUF model: original logic
      if (selectedModel.imported) {
        await clippyApi.removeModelByName(selectedModel.name);
      } else {
        await clippyApi.deleteModelByName(selectedModel.name);
      }
    }
  };

  const handleMakeDefault = async () => {
    if (selectedModel) {
      clippyApi.setState("settings.selectedModel", selectedModel.name);
    }
  };

  const handleSaveApiConfiguration = async () => {
    if (selectedModel) {
      const updatedModel: ManagedModel = {
        ...selectedModel,
        provider,
        apiBaseUrl,
        apiKey,
        modelName,
      };
      await clippyApi.setState(
        `models.${selectedModel.name}`,
        updatedModel,
      );
    }
  };

  const hasApiConfigChanged =
    selectedModel?.provider !== provider ||
    selectedModel?.apiBaseUrl !== apiBaseUrl ||
    selectedModel?.apiKey !== apiKey ||
    selectedModel?.modelName !== modelName;

  const handleOpenAddModelModal = () => {
    setNewRemoteModelConfig(initialNewRemoteModelConfig);
    setFormError(null);
    setIsAddModelModalOpen(true);
  };

  const handleCloseAddModelModal = () => {
    setIsAddModelModalOpen(false);
    setNewRemoteModelConfig(initialNewRemoteModelConfig);
    setFormError(null);
  };

  const handleNewRemoteModelChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setNewRemoteModelConfig((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveNewRemoteModel = async () => {
    setFormError(null);
    // Basic Validation
    if (
      !newRemoteModelConfig.name ||
      !newRemoteModelConfig.provider ||
      !newRemoteModelConfig.apiBaseUrl ||
      !newRemoteModelConfig.modelName // modelName for API
    ) {
      setFormError(
        "Name, Provider, API Base URL, and API Model Name are required.",
      );
      return;
    }

    // Check for unique name
    if (models && models[newRemoteModelConfig.name]) {
      setFormError(
        `A model with the name "${newRemoteModelConfig.name}" already exists.`,
      );
      return;
    }

    const newModelObject: ManagedModel = {
      name: newRemoteModelConfig.name!,
      provider: newRemoteModelConfig.provider!,
      apiBaseUrl: newRemoteModelConfig.apiBaseUrl!,
      modelName: newRemoteModelConfig.modelName!, // API model name
      apiKey: newRemoteModelConfig.apiKey || undefined,
      description: newRemoteModelConfig.description || undefined,
      company: newRemoteModelConfig.company || undefined,
      homepage: newRemoteModelConfig.homepage || undefined,
      size: 0, // Not applicable for remote
      downloaded: false, // Not applicable
      imported: true, // Signifies user-added, not built-in GGUF
      path: undefined, // Not applicable
      url: undefined, // Not applicable for this type of remote model
    };

    await clippyApi.setState(
      `models.${newModelObject.name}`,
      newModelObject,
    );
    handleCloseAddModelModal();
  };

  return (
    <div>
      <p>
        Select the model you want to use for your chat. The larger the model,
        the more powerful the chat, but the slower it will be - and the more
        memory it will use. Clippy uses models in the GGUF format.{" "}
        <a
          href="https://github.com/felixrieseberg/clippy?tab=readme-ov-file#downloading-more-models"
          target="_blank"
        >
          More information.
        </a>
      </p>

      <button
        style={{ marginBottom: 10 }}
        onClick={() => clippyApi.addModelFromFile()}
      >
        Add GGUF Model from File
      </button>
      <button
        style={{ marginBottom: 10, marginLeft: 10 }}
        onClick={handleOpenAddModelModal}
      >
        Add Remote API Model
      </button>

      {isAddModelModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content sunken-panel" style={{ width: "500px", padding: "20px" }}>
            <h3>Add New Remote API Model</h3>
            {formError && <p style={{ color: "red" }}>{formError}</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <label>
                Configuration Name: *
                <input
                  type="text"
                  name="name"
                  value={newRemoteModelConfig.name || ""}
                  onChange={handleNewRemoteModelChange}
                  placeholder="Unique name for this setup (e.g., My OpenAI GPT-4)"
                />
              </label>
              <label>
                Provider: *
                <input
                  type="text"
                  name="provider"
                  value={newRemoteModelConfig.provider || ""}
                  onChange={handleNewRemoteModelChange}
                  placeholder="e.g., litellm, openai, anthropic, custom"
                />
              </label>
              <label>
                API Base URL: *
                <input
                  type="text"
                  name="apiBaseUrl"
                  value={newRemoteModelConfig.apiBaseUrl || ""}
                  onChange={handleNewRemoteModelChange}
                  placeholder="e.g., https://api.openai.com/v1"
                />
              </label>
              <label>
                API Model Name: *
                <input
                  type="text"
                  name="modelName"
                  value={newRemoteModelConfig.modelName || ""}
                  onChange={handleNewRemoteModelChange}
                  placeholder="Model identifier for API (e.g., gpt-4-turbo)"
                />
              </label>
              <label>
                API Key: (Optional)
                <input
                  type="password"
                  name="apiKey"
                  value={newRemoteModelConfig.apiKey || ""}
                  onChange={handleNewRemoteModelChange}
                  placeholder="Your API Key"
                />
              </label>
              <label>
                Description: (Optional)
                <textarea
                  name="description"
                  value={newRemoteModelConfig.description || ""}
                  onChange={handleNewRemoteModelChange}
                  rows={3}
                />
              </label>
              <label>
                Company: (Optional)
                <input
                  type="text"
                  name="company"
                  value={newRemoteModelConfig.company || ""}
                  onChange={handleNewRemoteModelChange}
                />
              </label>
              <label>
                Homepage: (Optional)
                <input
                  type="text"
                  name="homepage"
                  value={newRemoteModelConfig.homepage || ""}
                  onChange={handleNewRemoteModelChange}
                />
              </label>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                <button onClick={handleCloseAddModelModal}>Cancel</button>
                <button onClick={handleSaveNewRemoteModel}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <TableView
        columns={columns}
        data={data}
        onRowSelect={handleRowSelect}
        initialSelectedIndex={selectedIndex}
      />

      {selectedModel && (
        <div
          className="model-details sunken-panel"
          style={{ marginTop: "20px", padding: "15px" }}
        >
          <strong>{selectedModel.name}</strong>

          <strong>{selectedModel.name}</strong>
          {selectedModel.provider === "gguf" && selectedModel.size && (
            <p>Size: {selectedModel.size.toLocaleString()} MB</p>
          )}
          {selectedModel.provider !== "gguf" && <p>Type: Remote API Model</p>}

          {selectedModel.description && <p>{selectedModel.description}</p>}

          {selectedModel.homepage && (
            <p>
              <a
                href={selectedModel.homepage}
                target="_blank"
                rel="noopener noreferrer"
              >
                Visit Homepage
              </a>
            </p>
          )}

          <div style={{ marginTop: "15px", display: "flex", gap: "10px" }}>
            {selectedModel.provider === "gguf" && !selectedModel.downloaded && (
              <button disabled={isDownloading} onClick={handleDownload}>
                Download Model
              </button>
            )}
            {/* Common buttons for both GGUF (if downloaded) and Remote */}
            {(selectedModel.provider !== "gguf" || selectedModel.downloaded) && (
              <button
                disabled={isDownloading || isDefaultModel}
                onClick={handleMakeDefault}
              >
                {isDefaultModel
                  ? "Clippy uses this model"
                  : "Make Clippy use this model"}
              </button>
            )}
            <button onClick={handleDeleteOrRemove}>
              {selectedModel.provider !== "gguf"
                ? "Remove Model"
                : selectedModel.imported
                  ? "Remove Model"
                  : "Delete Model"}
            </button>
          </div>
          {selectedModel.provider === "gguf" && (
            <SettingsModelDownload model={selectedModel} />
          )}

          {selectedModel.provider !== "gguf" && (
            <div style={{ marginTop: "20px" }}>
              <h4>API Configuration</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <label>
                  Provider:
                  <input
                    type="text"
                    value={provider || ""}
                    onChange={(e) => setProvider(e.target.value)}
                    placeholder="e.g., litellm, openai, anthropic"
                  />
                </label>
                <label>
                  API Base URL:
                  <input
                    type="text"
                    value={apiBaseUrl || ""}
                    onChange={(e) => setApiBaseUrl(e.target.value)}
                    placeholder="e.g., https://api.openai.com/v1"
                  />
                </label>
                <label>
                  API Key:
                  <input
                    type="password"
                    value={apiKey || ""}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Your API Key"
                  />
                </label>
                <label>
                  Model Name (for API):
                  <input
                    type="text"
                    value={modelName || ""}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder="e.g., claude-3-opus-20240229"
                  />
                </label>
                <button
                  onClick={handleSaveApiConfiguration}
                  disabled={!hasApiConfigChanged}
                >
                  Save API Configuration
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const SettingsModelDownload: React.FC<{
  model?: ManagedModel;
}> = ({ model }) => {
  if (!model || !isModelDownloading(model)) {
    return null;
  }

  const downloadSpeed = prettyDownloadSpeed(
    model?.downloadState?.currentBytesPerSecond || 0,
  );

  return (
    <div style={{ marginTop: "15px" }}>
      <p>
        Downloading {model.name}... ({downloadSpeed}/s)
      </p>
      <Progress progress={model.downloadState?.percentComplete || 0} />
    </div>
  );
};
