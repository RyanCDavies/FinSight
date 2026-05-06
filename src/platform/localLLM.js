export const LocalLLMBridge = {
  async prepareModelDownload() {
    return null;
  },

  async downloadModelAsset() {
    throw new Error('No native local LLM runtime is configured for this Expo build yet.');
  },

  async pickModelDirectory() {
    return null;
  },

  async configureModelDirectory() {
    return {
      available: false,
      backend: null,
      reason: 'No native local LLM runtime is configured for this Expo build yet.',
    };
  },

  async getBackendStatus() {
    return {
      available: false,
      backend: null,
      reason: 'No native local LLM runtime is configured for this Expo build yet.',
    };
  },

  async isAvailable() {
    return false;
  },

  async loadModel() {
    return {
      loaded: false,
      backend: null,
      reason: 'No native local LLM runtime is configured for this Expo build yet.',
    };
  },

  async generate() {
    return null;
  },

  async unloadModel() {
    return {
      loaded: false,
      backend: null,
      reason: 'No native local LLM runtime is configured for this Expo build yet.',
    };
  },

  async cancelGeneration() {
    return false;
  },
};
