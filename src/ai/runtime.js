import { AIStorage } from './storage';

const runtimeState = globalThis.__finsightAiRuntime || (globalThis.__finsightAiRuntime = {
  loaded: false,
  metadata: null,
});

export const AIRuntime = {
  async isAvailable() {
    const metadata = await AIStorage.readCurrentMetadata();
    return !!metadata;
  },

  async loadModel() {
    const metadata = await AIStorage.readCurrentMetadata();
    if (!metadata) {
      throw new Error('No local AI model is installed.');
    }

    runtimeState.loaded = true;
    runtimeState.metadata = metadata;
    return { loaded: true, metadata };
  },

  async unloadModel() {
    runtimeState.loaded = false;
    runtimeState.metadata = null;
  },

  async getLoadedModel() {
    return runtimeState.loaded ? runtimeState.metadata : null;
  },

  async generate({ userPrompt, contextSummary }) {
    if (!runtimeState.loaded || !runtimeState.metadata) {
      throw new Error('Local AI model is not loaded.');
    }

    const summary = contextSummary ? `${contextSummary} ` : '';
    return {
      text: `${summary}On-device model "${runtimeState.metadata.name}" is installed, but native mobile inference has not been connected yet. This response is coming from the hybrid-model scaffolding layer.`,
    };
  },
};
