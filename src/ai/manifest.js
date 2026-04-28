const DEFAULT_MANIFEST = {
  version: 1,
  updatedAt: '2026-04-27T00:00:00.000Z',
  models: [
    {
      id: 'gemma-2-mobile-starter',
      name: 'Gemma 2 Mobile Starter',
      version: '0.1.0',
      fileName: 'gemma-2-mobile-starter.task',
      sizeBytes: 1024 * 1024 * 512,
      minFreeSpaceBytes: 1024 * 1024 * 1024,
      recommendedFor: ['mid', 'high'],
      runtime: 'native-mobile',
      downloadMode: 'stub',
      description: 'Starter local assistant package placeholder used until a production model CDN is configured.',
      checksum: null,
      url: null,
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
