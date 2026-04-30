import { AIManifest } from './manifest';
import { AISettings } from './settings';
import { AIStorage } from './storage';

const runtime = globalThis.__finsightAiModelManager || (globalThis.__finsightAiModelManager = {
  currentInstall: null,
});

function emitProgress(callback, progress, detail) {
  callback?.({ progress, detail });
}

async function installStubModel(model, onProgress) {
  emitProgress(onProgress, 0.35, 'Preparing local model package...');
  await new Promise((resolve) => setTimeout(resolve, 250));
  emitProgress(onProgress, 0.7, 'Verifying local model package...');
  await new Promise((resolve) => setTimeout(resolve, 250));
  return AIStorage.getTempModelFile(model);
}

export const AIModelManager = {
  async initialize() {
    await AIStorage.ensureLayout();
    const manifest = await AIStorage.readManifest();
    if (!manifest) {
      await AIStorage.writeManifest(AIManifest.getDefaultManifest());
    }
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
    return (await AIStorage.readManifest()) || AIManifest.getDefaultManifest();
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

    runtime.currentInstall = { cancelled: false, modelId };
    await AIStorage.writeStatus({ state: 'downloading', progress: 0, modelId });
    emitProgress(onProgress, 0.05, 'Starting download...');

    try {
      const tempFile = await installStubModel(model, onProgress);

      if (runtime.currentInstall?.cancelled) {
        await AIStorage.writeStatus({ state: 'not-installed' });
        throw new Error('Install cancelled.');
      }

      emitProgress(onProgress, 0.9, 'Finalizing install...');
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
      };

      await AIStorage.promoteTempToCurrent(tempFile, metadata);
      await AISettings.setEnabled(true);
      await AISettings.setInstalledModelRef(model.id, model.version);
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
