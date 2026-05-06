import { NativeModules, TurboModuleRegistry } from 'react-native';

const windowsLocalLLM =
  NativeModules.WindowsLocalLLM ||
  (typeof TurboModuleRegistry?.get === 'function' ? TurboModuleRegistry.get('WindowsLocalLLM') : null);

export const LocalLLMBridge = {
  async prepareModelDownload(installDirectoryName) {
    if (!windowsLocalLLM?.prepareModelDownload) {
      return null;
    }

    return windowsLocalLLM.prepareModelDownload(installDirectoryName);
  },

  async downloadModelAsset(url, installDirectoryName, relativePath) {
    if (!windowsLocalLLM?.downloadModelAsset) {
      throw new Error('Windows local LLM module is not registered in this build yet.');
    }

    return windowsLocalLLM.downloadModelAsset(url, installDirectoryName, relativePath);
  },

  async pickModelDirectory() {
    if (!windowsLocalLLM?.pickModelDirectory) {
      return null;
    }

    return windowsLocalLLM.pickModelDirectory();
  },

  async configureModelDirectory(path) {
    if (!windowsLocalLLM?.configureModelDirectory) {
      return {
        available: false,
        configured: false,
        backend: 'windows-native',
        reason: 'Windows local LLM module is not registered in this build yet.',
      };
    }

    return windowsLocalLLM.configureModelDirectory(path);
  },

  async getBackendStatus() {
    if (!windowsLocalLLM?.getStatus) {
      return {
        available: false,
        backend: 'windows-native',
        reason: 'Windows local LLM module is not registered in this build yet.',
      };
    }

    try {
      return await windowsLocalLLM.getStatus();
    } catch (error) {
      return {
        available: false,
        backend: 'windows-native',
        reason: error?.message || 'Unable to read the Windows local LLM status.',
      };
    }
  },

  async isAvailable() {
    const status = await this.getBackendStatus();
    return !!status.available;
  },

  async loadModel(modelConfig = {}) {
    if (!windowsLocalLLM?.loadModel) {
      return {
        loaded: false,
        backend: 'windows-native',
        reason: 'Windows local LLM module is not registered in this build yet.',
      };
    }

    return windowsLocalLLM.loadModel(modelConfig);
  },

  async unloadModel() {
    if (!windowsLocalLLM?.unloadModel) {
      return {
        loaded: false,
        backend: 'windows-native',
        reason: 'Windows local LLM module is not registered in this build yet.',
      };
    }

    return windowsLocalLLM.unloadModel();
  },

  async cancelGeneration() {
    if (!windowsLocalLLM?.cancelGeneration) {
      return false;
    }

    return windowsLocalLLM.cancelGeneration();
  },

  async generate(payload = {}) {
    if (!windowsLocalLLM?.generate) {
      return null;
    }

    return windowsLocalLLM.generate(payload);
  },
};
