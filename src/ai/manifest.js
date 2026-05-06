const PHI3_CPU_BASE_URL = 'https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-onnx/resolve/main/cpu_and_mobile/cpu-int4-rtn-block-32-acc-level-4';

const DEFAULT_MANIFEST = {
  version: 1,
  updatedAt: '2026-05-05T00:00:00.000Z',
  models: [
    {
      id: 'phi-3-mini-4k-instruct-onnx-cpu-int4',
      name: 'Phi-3 Mini 4K Instruct ONNX CPU Int4',
      version: '2026.05.05',
      fileName: 'phi-3-mini-4k-instruct-onnx-cpu-int4.task',
      sizeBytes: 2931318128,
      minFreeSpaceBytes: 5 * 1024 * 1024 * 1024,
      recommendedFor: ['mid', 'high'],
      runtime: 'windows-native-onnx',
      downloadMode: 'windows-managed',
      description: 'On-device Phi-3 Mini ONNX Runtime GenAI package for the Windows FinSight assistant.',
      checksum: null,
      url: null,
      windowsPackage: {
        installDirectoryName: 'phi-3-mini-4k-instruct-onnx-cpu-int4',
        files: [
          {
            relativePath: 'added_tokens.json',
            url: `${PHI3_CPU_BASE_URL}/added_tokens.json`,
            sizeBytes: 306,
          },
          {
            relativePath: 'config.json',
            url: `${PHI3_CPU_BASE_URL}/config.json`,
            sizeBytes: 919,
          },
          {
            relativePath: 'genai_config.json',
            url: `${PHI3_CPU_BASE_URL}/genai_config.json`,
            sizeBytes: 1580,
          },
          {
            relativePath: 'phi3-mini-4k-instruct-cpu-int4-rtn-block-32-acc-level-4.onnx',
            url: `${PHI3_CPU_BASE_URL}/phi3-mini-4k-instruct-cpu-int4-rtn-block-32-acc-level-4.onnx`,
            sizeBytes: 231 * 1024,
            sha256: '385cd1b908a0d2f8634e86d30236f6dbb7ae660eb3943fd1ef5bdc3847326480',
          },
          {
            relativePath: 'phi3-mini-4k-instruct-cpu-int4-rtn-block-32-acc-level-4.onnx.data',
            url: `${PHI3_CPU_BASE_URL}/phi3-mini-4k-instruct-cpu-int4-rtn-block-32-acc-level-4.onnx.data`,
            sizeBytes: 2920577761,
            sha256: '5db30ce699aee1123cf9045742488db5928006fa618a42cb3c0840322a85ad0f',
          },
          {
            relativePath: 'special_tokens_map.json',
            url: `${PHI3_CPU_BASE_URL}/special_tokens_map.json`,
            sizeBytes: 599,
          },
          {
            relativePath: 'tokenizer.json',
            url: `${PHI3_CPU_BASE_URL}/tokenizer.json`,
            sizeBytes: 2034237,
          },
          {
            relativePath: 'tokenizer.model',
            url: `${PHI3_CPU_BASE_URL}/tokenizer.model`,
            sizeBytes: 512000,
          },
          {
            relativePath: 'tokenizer_config.json',
            url: `${PHI3_CPU_BASE_URL}/tokenizer_config.json`,
            sizeBytes: 3440,
          },
        ],
      },
    },
  ],
};

function pickDeviceTier() {
  return 'mid';
}

export const AIManifest = {
  getDefaultManifest() {
    return DEFAULT_MANIFEST;
  },

  async fetchRemoteManifest() {
    return DEFAULT_MANIFEST;
  },

  getRecommendedModel(manifest = DEFAULT_MANIFEST) {
    const tier = pickDeviceTier();
    return (
      manifest.models.find((model) => Array.isArray(model.recommendedFor) && model.recommendedFor.includes(tier)) ||
      manifest.models[0] ||
      null
    );
  },
};
