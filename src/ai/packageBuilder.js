function createAliasMap() {
  return {
    atm: 'ATM',
    cvs: 'CVS',
    hsa: 'HSA',
    irs: 'IRS',
    lyft: 'Lyft',
    pos: 'POS',
    target: 'Target',
    uber: 'Uber',
    venmo: 'Venmo',
    visa: 'Visa',
    walmart: 'Walmart',
    zelle: 'Zelle',
  };
}

export function buildBootstrapPackage(model) {
  return {
    schemaVersion: 1,
    packageType: 'finsight-local-ai',
    generatedAt: new Date().toISOString(),
    model: {
      id: model.id,
      name: model.name,
      version: model.version,
      runtime: model.runtime,
      description: model.description,
    },
    capabilities: {
      chat: true,
      ocrTitleCleanup: true,
      offlineOnly: true,
    },
    assistant: {
      name: 'FinSight Local Assistant',
      tone: 'concise, practical, privacy-first',
      starterPrompts: [
        'How much did I spend on food?',
        'Which budget needs attention?',
        'What should I review from my recent imports?',
      ],
    },
    providers: {
      windows: {
        engine: 'onnxruntime-genai',
        modelFormat: 'onnx-directory',
        configured: false,
      },
      mobile: {
        engine: 'expo-native-local-llm',
        modelFormat: 'native-local-model',
        configured: false,
      },
    },
    ocr: {
      noiseWords: [
        'approved',
        'auth',
        'authorization',
        'balance',
        'card',
        'cash',
        'checkcard',
        'credit',
        'date',
        'debit',
        'ending',
        'member',
        'payment',
        'pending',
        'posted',
        'purchase',
        'ref',
        'reference',
        'sale',
        'store',
        'terminal',
        'total',
        'transaction',
      ],
      aliasMap: createAliasMap(),
    },
  };
}
