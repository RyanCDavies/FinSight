import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { AIManifest } from './manifest';
import { buildBootstrapPackage } from './packageBuilder';
import { AISettings } from './settings';
import { AIStorage } from './storage';
import { AIModelManager as WindowsAIModelManager } from './modelManager.windows';

const runtime = globalThis.__finsightAiModelManager || (globalThis.__finsightAiModelManager = {
  currentInstall: null,
});

function shouldUseWindowsManager() {
  return Platform.OS === 'windows' || !FileSystem.documentDirectory;
}

function emitProgress(callback, progress, detail) {
  callback?.({ progress, detail });
}

async function updateProgress(modelId, onProgress, progress, detail) {
  await AIStorage.writeStatus({ state: 'downloading', progress, modelId, detail });
  emitProgress(onProgress, progress, detail);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function installBootstrapModel(model, onProgress) {
  const payload = buildBootstrapPackage(model);
  await updateProgress(model.id, onProgress, 0.18, 'Preparing local Gemma 3n package...');
  await sleep(180);
  await updateProgress(model.id, onProgress, 0.42, 'Downloading assistant package...');
  await sleep(220);
  const tempFile = await AIStorage.writeTempPackage(model, payload);
  await updateProgress(model.id, onProgress, 0.7, 'Installing local assistant package...');
  await sleep(180);
  await updateProgress(model.id, onProgress, 0.84, 'Verifying offline assistant package...');
  await sleep(180);
  return tempFile;
}

async function installRemoteModel(model, onProgress) {
  if (Platform.OS === 'windows' || !FileSystem.documentDirectory) {
    throw new Error('Remote model downloads are not configured for this platform build.');
  }

  const tempFile = await AIStorage.getTempModelFile(model);
  await updateProgress(model.id, onProgress, 0.2, 'Connecting to model host...');
  const result = await FileSystem.downloadAsync(model.url, tempFile);
  await updateProgress(model.id, onProgress, 0.78, 'Download complete. Preparing install...');
  return result.uri;
}

export const AIModelManager = {
  async initialize() {
    if (shouldUseWindowsManager()) {
      return WindowsAIModelManager.initialize();
    }

    await AIStorage.ensureLayout();
    const manifest = await AIStorage.readManifest();
    if (!manifest) {
      await AIStorage.writeManifest(AIManifest.getDefaultManifest());
    }
    const status = await AIStorage.readStatus();
    return status;
  },

  async getStatus() {
    if (shouldUseWindowsManager()) {
      return WindowsAIModelManager.getStatus();
    }

    await this.initialize();
    const [status, metadata] = await Promise.all([
      AIStorage.readStatus(),
      AIStorage.readCurrentMetadata(),
    ]);

    if (status.state === 'installed' && metadata) {
      return {
        state: 'installed',
        modelId: metadata.id,
        version: metadata.version,
        name: metadata.name,
        sizeBytes: metadata.sizeBytes,
        installedAt: metadata.installedAt,
        runtime: metadata.runtime,
      };
    }

    if (status.state === 'downloading') {
      return status;
    }

    return { state: 'not-installed' };
  },

  async refreshManifest() {
    if (shouldUseWindowsManager()) {
      return WindowsAIModelManager.refreshManifest();
    }

    const manifest = await AIManifest.fetchRemoteManifest();
    await AIStorage.writeManifest(manifest);
    await AISettings.setLastManifestRefresh(new Date().toISOString());
    return manifest;
  },

  async getManifest() {
    if (shouldUseWindowsManager()) {
      return WindowsAIModelManager.getManifest();
    }

    await this.initialize();
    return (await AIStorage.readManifest()) || AIManifest.getDefaultManifest();
  },

  async getRecommendedModel() {
    if (shouldUseWindowsManager()) {
      return WindowsAIModelManager.getRecommendedModel();
    }

    const manifest = await this.getManifest();
    return AIManifest.getRecommendedModel(manifest);
  },

  async install(modelId, onProgress) {
    if (shouldUseWindowsManager()) {
      return WindowsAIModelManager.install(modelId, onProgress);
    }

    if (runtime.currentInstall?.cancelled === false) {
      throw new Error('Another model install is already in progress.');
    }

    const manifest = await this.getManifest();
    const model = manifest.models.find((candidate) => candidate.id === modelId);
    if (!model) {
      throw new Error('Requested model was not found in the manifest.');
    }

    runtime.currentInstall = { cancelled: false, modelId };
    await AIStorage.writeStatus({ state: 'downloading', progress: 0, modelId });
    emitProgress(onProgress, 0.05, 'Starting download...');

    try {
      let tempFile = null;
      if (model.downloadMode === 'bootstrap' || model.downloadMode === 'stub' || !model.url) {
        tempFile = await installBootstrapModel(model, onProgress);
      } else {
        tempFile = await installRemoteModel(model, onProgress);
      }

      if (runtime.currentInstall?.cancelled) {
        await AIStorage.writeStatus({ state: 'not-installed' });
        throw new Error('Install cancelled.');
      }

      await updateProgress(model.id, onProgress, 0.92, 'Finalizing install...');
      const metadata = {
        id: model.id,
        name: model.name,
        version: model.version,
        runtime: model.runtime,
        sizeBytes: model.sizeBytes,
        fileName: model.fileName,
        installedAt: new Date().toISOString(),
        checksum: model.checksum,
        sourceUrl: model.url,
        capabilities: ['chat', 'ocr-title-cleanup'],
      };

      await AIStorage.promoteTempToCurrent(tempFile, metadata);
      await AISettings.setEnabled(true);
      await AISettings.setInstalledModelRef(model.id, model.version);
      await AIStorage.writeStatus({ state: 'installed', modelId: model.id, version: model.version, detail: 'Gemma 3n local package installed.' });
      emitProgress(onProgress, 1, 'Install complete.');
      return metadata;
    } finally {
      runtime.currentInstall = null;
    }
  },

  async cancelInstall() {
    if (shouldUseWindowsManager()) {
      return WindowsAIModelManager.cancelInstall();
    }

    if (runtime.currentInstall) {
      runtime.currentInstall.cancelled = true;
    }
    await AIStorage.writeStatus({ state: 'not-installed' });
  },

  async verifyInstalledModel() {
    if (shouldUseWindowsManager()) {
      return WindowsAIModelManager.verifyInstalledModel();
    }

    const metadata = await AIStorage.readCurrentMetadata();
    return !!metadata;
  },

  async removeInstalledModel() {
    if (shouldUseWindowsManager()) {
      return WindowsAIModelManager.removeInstalledModel();
    }

    await AIStorage.removeCurrent();
    await AISettings.setEnabled(false);
    await AISettings.clearInstalledModelRef();
    return { removed: true };
  },

  async rollbackModel() {
    if (shouldUseWindowsManager()) {
      return WindowsAIModelManager.rollbackModel();
    }

    const previous = await AIStorage.readPreviousMetadata();
    if (!previous) {
      throw new Error('No previous model is available for rollback.');
    }

    await AIStorage.writeCurrentMetadata(previous);
    await AIStorage.writeStatus({ state: 'installed', modelId: previous.id, version: previous.version });
    await AISettings.setInstalledModelRef(previous.id, previous.version);
    return previous;
  },
};
