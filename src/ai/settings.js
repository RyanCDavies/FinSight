import { deleteItemAsync, getItemAsync, setItemAsync } from '../platform/secureStore';

const KEYS = {
  enabled: 'ai_enabled',
  modelId: 'ai_model_id',
  modelVersion: 'ai_model_version',
  lastManifestRefresh: 'ai_last_manifest_refresh',
};

export const AISettings = {
  async getEnabled() {
    return (await getItemAsync(KEYS.enabled)) === 'true';
  },

  async setEnabled(value) {
    await setItemAsync(KEYS.enabled, value ? 'true' : 'false');
  },

  async getInstalledModelRef() {
    const [modelId, modelVersion] = await Promise.all([
      getItemAsync(KEYS.modelId),
      getItemAsync(KEYS.modelVersion),
    ]);
    return modelId ? { modelId, modelVersion } : null;
  },

  async setInstalledModelRef(modelId, modelVersion) {
    await Promise.all([
      setItemAsync(KEYS.modelId, modelId),
      setItemAsync(KEYS.modelVersion, modelVersion),
    ]);
  },

  async clearInstalledModelRef() {
    await Promise.all([
      deleteItemAsync(KEYS.modelId),
      deleteItemAsync(KEYS.modelVersion),
    ]);
  },

  async getLastManifestRefresh() {
    return getItemAsync(KEYS.lastManifestRefresh);
  },

  async setLastManifestRefresh(value) {
    await setItemAsync(KEYS.lastManifestRefresh, value);
  },
};
