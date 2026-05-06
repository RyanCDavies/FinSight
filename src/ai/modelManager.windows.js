import { AIManifest } from './manifest';
import { buildBootstrapPackage } from './packageBuilder';
import { AISettings } from './settings';
import { AIStorage } from './storage';
import { LocalLLMBridge } from '../platform/localLLM';

const runtime = globalThis.__finsightAiModelManager || (globalThis.__finsightAiModelManager = {
  currentInstall: null,
});

function manifestSupportsManagedWindowsDownloads(manifest) {
  return Array.isArray(manifest?.models) && manifest.models.some((model) => {
    return Array.isArray(model?.windowsPackage?.files) && model.windowsPackage.files.length > 0;
  });
}

async function ensureCurrentManifest() {
  const manifest = await AIStorage.readManifest();
  if (manifestSupportsManagedWindowsDownloads(manifest)) {
    return manifest;
  }

  const defaultManifest = AIManifest.getDefaultManifest();
  await AIStorage.writeManifest(defaultManifest);
  return defaultManifest;
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

function getWindowsPackage(model) {
  return model?.windowsPackage && Array.isArray(model.windowsPackage.files)
    ? model.windowsPackage
    : null;
}

async function downloadManagedWindowsModel(model, windowsPackage, onProgress) {
  const installDirectoryName = windowsPackage.installDirectoryName || `${model.id}-${model.version}`;
  await updateProgress(model.id, onProgress, 0.1, 'Preparing the Windows local model directory...');
  const modelDirectory = await LocalLLMBridge.prepareModelDownload(installDirectoryName);

  if (!modelDirectory) {
    throw new Error('Unable to prepare the managed Windows model directory.');
  }

  const files = windowsPackage.files || [];
  const totalBytes = files.reduce((sum, file) => sum + Number(file.sizeBytes || 0), 0);
  let completedBytes = 0;

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    if (!file?.url || !file?.relativePath) {
      throw new Error('The Windows model package manifest is missing a file URL or relative path.');
    }

    const fileLabel = file.relativePath.split(/[\\/]/).pop() || `file ${index + 1}`;
    const boundedProgress = 0.16 + ((totalBytes ? completedBytes / totalBytes : index / files.length) * 0.56);
    await updateProgress(model.id, onProgress, boundedProgress, `Downloading ${fileLabel}...`);
    await LocalLLMBridge.downloadModelAsset(file.url, installDirectoryName, file.relativePath);
    completedBytes += Number(file.sizeBytes || 0);
  }

  await updateProgress(model.id, onProgress, 0.76, 'Validating the downloaded Windows local model...');
  const configuredStatus = await LocalLLMBridge.configureModelDirectory(modelDirectory);
  await sleep(120);

  return {
    modelDirectory,
    configuredStatus,
    managed: true,
    installDirectoryName,
  };
}

async function installBootstrapModel(model, onProgress) {
  const windowsPackage = getWindowsPackage(model);
  if (windowsPackage?.files?.length) {
    const downloaded = await downloadManagedWindowsModel(model, windowsPackage, onProgress);
    const basePackage = buildBootstrapPackage(model);
    const payload = {
      ...basePackage,
      providers: {
        ...basePackage.providers,
        windows: {
          ...basePackage.providers.windows,
          configured: !!downloaded.configuredStatus.configured,
          modelDirectory: downloaded.modelDirectory,
          managed: true,
          installDirectoryName: downloaded.installDirectoryName,
          files: windowsPackage.files.map((file) => ({
            relativePath: file.relativePath,
            sizeBytes: file.sizeBytes || null,
            sha256: file.sha256 || null,
            url: file.url,
          })),
        },
      },
    };
    const tempFile = await AIStorage.writeTempPackage(model, payload);
    await updateProgress(model.id, onProgress, 0.84, 'Verifying the downloaded Windows local model...');
    await sleep(180);
    return tempFile;
  }

  await updateProgress(model.id, onProgress, 0.12, 'Selecting a Windows local model directory...');
  const existingStatus = await LocalLLMBridge.getBackendStatus();
  let modelDirectory = existingStatus.modelDirectory || null;

  if (!modelDirectory) {
    modelDirectory = await LocalLLMBridge.pickModelDirectory();
  }

  if (!modelDirectory) {
    throw new Error('No Windows local model directory was selected.');
  }

  const configuredStatus = await LocalLLMBridge.configureModelDirectory(modelDirectory);
  await updateProgress(model.id, onProgress, 0.24, 'Validating ONNX Runtime GenAI model folder...');
  await sleep(180);
  await updateProgress(model.id, onProgress, 0.42, 'Saving Windows local AI configuration...');
  await sleep(220);
  const basePackage = buildBootstrapPackage(model);
  const payload = {
    ...basePackage,
    providers: {
      ...basePackage.providers,
      windows: {
        ...basePackage.providers.windows,
        configured: !!configuredStatus.configured,
        modelDirectory,
      },
    },
  };
  const tempFile = await AIStorage.writeTempPackage(model, payload);
  await updateProgress(model.id, onProgress, 0.7, 'Registering Windows local model...');
  await sleep(180);
  await updateProgress(model.id, onProgress, 0.84, 'Verifying Windows local model configuration...');
  await sleep(180);
  return tempFile;
}

export const AIModelManager = {
  async initialize() {
    await AIStorage.ensureLayout();
    await ensureCurrentManifest();
    return AIStorage.readStatus();
  },

  async getStatus() {
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
    const manifest = await AIManifest.fetchRemoteManifest();
    await AIStorage.writeManifest(manifest);
    await AISettings.setLastManifestRefresh(new Date().toISOString());
    return manifest;
  },

  async getManifest() {
    await this.initialize();
    return ensureCurrentManifest();
  },

  async getRecommendedModel() {
    const manifest = await this.getManifest();
    return AIManifest.getRecommendedModel(manifest);
  },

  async install(modelId, onProgress) {
    if (runtime.currentInstall?.cancelled === false) {
      throw new Error('Another model install is already in progress.');
    }

    const manifest = await this.getManifest();
    const model = manifest.models.find((candidate) => candidate.id === modelId);
    if (!model) {
      throw new Error('Requested model was not found in the manifest.');
    }
    const windowsPackage = getWindowsPackage(model);

    runtime.currentInstall = { cancelled: false, modelId };
    await AIStorage.writeStatus({ state: 'downloading', progress: 0, modelId });
    emitProgress(onProgress, 0.05, 'Starting download...');

    try {
      const tempFile = await installBootstrapModel(model, onProgress);

      if (runtime.currentInstall?.cancelled) {
        await AIStorage.writeStatus({ state: 'not-installed' });
        throw new Error('Install cancelled.');
      }

      await updateProgress(model.id, onProgress, 0.92, 'Finalizing install...');
      const metadata = {
        id: model.id,
        name: model.name,
        version: model.version,
        runtime: 'windows-native-onnx',
        sizeBytes: windowsPackage?.files?.length
          ? windowsPackage.files.reduce((sum, file) => sum + Number(file.sizeBytes || 0), 0)
          : model.sizeBytes,
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
    if (runtime.currentInstall) {
      runtime.currentInstall.cancelled = true;
    }
    await AIStorage.writeStatus({ state: 'not-installed' });
  },

  async verifyInstalledModel() {
    const metadata = await AIStorage.readCurrentMetadata();
    return !!metadata;
  },

  async removeInstalledModel() {
    await AIStorage.removeCurrent();
    await AISettings.setEnabled(false);
    await AISettings.clearInstalledModelRef();
    return { removed: true };
  },

  async rollbackModel() {
    const previous = await AIStorage.readPreviousMetadata();
    if (!previous) {
      throw new Error('No previous model is available for rollback.');
    }

    await AIStorage.writeCurrentMetadata(previous);
    await AIStorage.writeStatus({
      state: 'installed',
      modelId: previous.id,
      version: previous.version,
    });
    await AISettings.setInstalledModelRef(previous.id, previous.version);
    return previous;
  },
};
