import { app, DownloadItem, session, dialog } from "electron";
import path from "path";
import fs from "fs";
import { getLogger } from "./logger";

import { ManagedModel, ModelState, Model, BUILT_IN_MODELS } from "../models";
import { DownloadState } from "../sharedState";
import { getStateManager } from "./state";
import { MockDownloadItem } from "./MockDownloadItem";
import { getDebugManager } from "./debug";

class ModelManager {
  private downloadItems: Record<string, DownloadItem | MockDownloadItem> = {};

  constructor() {
    session.defaultSession.on("will-download", (event, downloadItem) =>
      this.onSessionWillDownload(event, downloadItem),
    );
  }

  private get models() {
    return getStateManager().store.get("models");
  }

  private set models(models: ModelState) {
    getStateManager().store.set("models", models);
  }

  /**
   * Returns a managed model from a model
   *
   * @param model
   * @returns
   */
  public getManagedModelFromModel(model: Model): ManagedModel {
    return {
      ...model,
      downloaded: this.getIsModelDownloaded(model),
      path: getModelPath(model),
      apiBaseUrl: model.apiBaseUrl,
      apiKey: model.apiKey,
      modelName: model.modelName,
      provider: model.provider,
    };
  }

  /**
   * Downloads a model by name
   *
   * @param name
   */
  public async downloadModelByName(name: string) {
    getLogger().info("Downloading model by name", name);

    const model = this.models[name];

    if (!model) {
      throw new Error(`Model not found: ${name}`);
    }

    // Cancel existing download if any
    if (this.downloadItems[name]) {
      try {
        this.downloadItems[name].cancel();
      } catch (error) {
        getLogger().error(
          `ModelManager: Error canceling download: ${name}`,
          error,
        );
      }

      delete this.downloadItems[name];
    }

    // Set model state
    model.downloaded = false;
    model.path = getModelPath(model);

    if (getDebugManager().store.get("simulateDownload")) {
      this.downloadItems[name] = new MockDownloadItem(model, () => {
        model.downloaded = true;
        this.pollRendererModelState();
      });
    } else {
      session.defaultSession.downloadURL(model.url);
    }

    setTimeout(() => {
      this.pollRendererModelState();
    }, 500);
  }

  /**
   * Removes models from state without deleting them from disk
   *
   * @param name {string}
   * @returns {Promise<void>}
   */
  public async removeModelByName(name: string) {
    getLogger().info("Removing model by name", name);

    const models = { ...this.models };

    if (models[name]) {
      this.cancelDownload(this.models[name]);

      delete models[name];
      this.models = models;
    }

    this.pollRendererModelState();
  }

  /**
   * Deletes a model by name
   *
   * @param name
   * @returns
   */
  public async deleteModelByName(name: string): Promise<boolean> {
    getLogger().info("Deleting model by name", name);

    const model = this.models[name];

    if (!model || !model.path) {
      getLogger().warn(
        `ModelManager deleteModelByName: Model not found: ${name}`,
      );
      throw new Error(`Model not found: ${name}`);
    }

    if (model.imported) {
      getLogger().warn(
        `ModelManager deleteModelByName: Tried to delete imported model: ${name}`,
      );
      throw new Error(`Refusing to delete imported model: ${name}`);
    }

    this.cancelDownload(model);

    if (fs.existsSync(model.path)) {
      try {
        await fs.promises.unlink(model.path);
        model.downloaded = false;
        model.path = undefined;
      } catch (error) {
        getLogger().error(`ModelManager: Error deleting model: ${name}`, error);
        return false;
      }
    }

    this.pollRendererModelState();
    return true;
  }

  /**
   * Returns a model by name
   *
   * @param name
   * @returns
   */
  public getModelByName(name: string): ManagedModel | undefined {
    return this.models[name];
  }

  /**
   * Deletes all models
   */
  public async deleteAllModels() {
    this.cancelAllDownloads();

    try {
      await fs.promises.rm(path.join(app.getPath("userData"), "models"), {
        recursive: true,
      });
    } catch (error) {
      getLogger().error(`ModelManager: Error deleting all models`, error);
    }

    this.pollRendererModelState();
  }

  /**
   * Polls the renderer model state
   */
  public pollRendererModelState() {
    process.nextTick(() => {
      getStateManager().store.set("models", this.getRendererModelState());
      getStateManager().onDidAnyChange();
    });
  }

  /**
   * Returns the initial renderer model state
   *
   * @returns
   */
  public getInitialRendererModelState(): ModelState {
    const result: ModelState = {};

    for (const model of BUILT_IN_MODELS) {
      result[model.name] = this.getManagedModelFromModel(model);
    }

    return result;
  }

  /**
   * Returns the state of the models for the renderer
   *
   * @returns
   */
  public getRendererModelState(): ModelState {
    const result: ModelState = {};

    for (const model of Object.values(this.models)) {
      const downloadItem = this.downloadItems[model.name];
      const downloadState: DownloadState | undefined = downloadItem
        ? {
            totalBytes: downloadItem.getTotalBytes(),
            receivedBytes: downloadItem.getReceivedBytes(),
            percentComplete: downloadItem.getPercentComplete(),
            startTime: downloadItem.getStartTime(),
            savePath: downloadItem.getSavePath(),
            currentBytesPerSecond: downloadItem.getCurrentBytesPerSecond(),
            state: downloadItem.getState(),
          }
        : undefined;

      result[model.name] = {
        name: model.name,
        company: model.company,
        size: model.size,
        url: model.url,
        path: model.path,
        description: model.description,
        homepage: model.homepage,
        imported: model.imported,
        downloaded: this.getIsModelDownloaded(model),
        downloadState,
        apiBaseUrl: model.apiBaseUrl,
        apiKey: model.apiKey,
        modelName: model.modelName,
        provider: model.provider,
      };
    }

    return result;
  }

  /**
   * Returns true if the model exists on disk and is not downloading
   *
   * @param model
   * @returns
   */
  public getIsModelDownloaded(model: ManagedModel | Model): boolean {
    if (getDebugManager().store.get("simulateNoModelsDownloaded")) {
      return false;
    }

    const existsOnDisk = isModelOnDisk(model);
    const hasDownloadItem = this.downloadItems[model.name];
    const isDownloading =
      hasDownloadItem &&
      this.downloadItems[model.name].getState() !== "completed";

    return existsOnDisk && !isDownloading;
  }

  /**
   * Opens a file dialog to select a GGUF file and adds it as a model
   */
  public async addModelFromFile() {
    try {
      const result = await dialog.showOpenDialog({
        title: "Select a GGUF Model File",
        defaultPath: app.getPath("downloads"),
        filters: [{ name: "GGUF Model Files", extensions: ["gguf"] }],
        properties: ["openFile"],
      });

      if (result.canceled || result.filePaths.length === 0) {
        getLogger().info("No file selected for adding model.");
        return;
      }

      const filePath = result.filePaths[0];
      const fileName = path.basename(filePath);

      if (this.models[fileName]) {
        const overwrite = await dialog.showMessageBox({
          type: "warning",
          buttons: ["Overwrite", "Cancel"],
          defaultId: 1,
          title: "Model Already Exists",
          message: `A model with the name "${fileName}" already exists. Do you want to overwrite the entry in Clippy? This will not delete the file on disk.`,
        });

        if (overwrite.response !== 0) {
          getLogger().info("User canceled overwriting the existing model.");
          return;
        }
      }

      const model: ManagedModel = {
        name: fileName,
        size: Math.round(fs.statSync(filePath).size / (1024 * 1024)),
        path: filePath,
        description: `Imported GGUF model from ${filePath}.`,
        imported: true,
        provider: "gguf",
        apiBaseUrl: undefined,
        apiKey: undefined,
        modelName: undefined,
      };

      const models = { ...this.models, [fileName]: model };
      getStateManager().store.set("models", models);
      this.pollRendererModelState();

      getLogger().info(`Model added from file: ${filePath}`);
    } catch (error) {
      getLogger().error("Error adding model from file", error);
    }
  }

  /**
   * Handles the will-download event
   *
   * @param downloadItem
   */
  private onSessionWillDownload(
    event: Electron.Event,
    downloadItem: DownloadItem,
  ) {
    const urlChain = downloadItem.getURLChain();
    const urlStr = urlChain[0];
    const modelKey = Object.keys(this.models).find(
      (k) => this.models[k].url === urlStr,
    );
    const model = this.models[modelKey];

    if (!model) {
      getLogger().info(
        `ModelManager: Handling will-download event for ${urlStr}, but did not find matching model. Disallowing download.`,
      );
      event.preventDefault();
      return false;
    }

    // Check if there's already a download in progress for this model
    const existingDownload = this.downloadItems[model.name];
    if (existingDownload && existingDownload.getState() === "progressing") {
      getLogger().info(
        `ModelManager: Download already in progress for model ${model.name}. Disallowing duplicate download.`,
      );
      event.preventDefault();
      return false;
    }

    getLogger().info(
      `ModelManager: Handling will-download event for model ${model.name}. Allowing download.`,
    );

    model.path = getModelPath(model);
    model.downloaded = false;
    this.downloadItems[model.name] = downloadItem;

    downloadItem.setSavePath(model.path);

    return true;
  }

  /**
   * Cancels a download by name
   *
   * @param name
   */
  private cancelDownload(model: ManagedModel) {
    if (this.isModelDownloading(model)) {
      try {
        this.downloadItems[model.name].cancel();
      } catch (error) {
        getLogger().error(
          `ModelManager: Error canceling download: ${model.name}`,
          error,
        );
      }

      delete this.downloadItems[model.name];
    }
  }

  /**
   * Cancels all downloads
   */
  private cancelAllDownloads() {
    for (const name in this.downloadItems) {
      this.cancelDownload(this.models[name]);
    }
  }

  /**
   * Returns true if the model is downloading
   *
   * @param model
   * @returns
   */
  private isModelDownloading(model: ManagedModel) {
    return (
      this.downloadItems[model.name] &&
      this.downloadItems[model.name].getState() !== "completed"
    );
  }
}

let _modelManager: ModelManager;
export function getModelManager() {
  if (!_modelManager) {
    _modelManager = new ModelManager();
  }

  return _modelManager;
}

/**
 * Returns true if the model is on disk
 *
 * @param model
 * @returns {boolean}
 */
export function isModelOnDisk(model: ManagedModel | Model): boolean {
  const filePath = "path" in model ? model.path : getModelPath(model);
  const existsOnDisk = fs.existsSync(filePath);

  return existsOnDisk;
}

/**
 * Returns the path to the model on disk
 *
 * @param model
 * @returns {string}
 */
export function getModelPath(model: Model): string {
  return path.join(app.getPath("userData"), "models", getModelFileName(model));
}

/**
 * Returns the file name of the model
 *
 * @param model
 * @returns {string}
 */
export function getModelFileName(model: Model): string {
  return path.basename(new URL(model.url).pathname);
}
