import { readJsonFile, writeJsonFile } from './windowsStorage';

const STORE_FILENAME = 'finsight-secure-store.json';

const runtime = globalThis.__finsightWindowsSecureStore || (globalThis.__finsightWindowsSecureStore = {
  loaded: false,
  loadingPromise: null,
  persistQueue: Promise.resolve(),
  data: {},
});

async function ensureLoaded() {
  if (runtime.loaded) {
    return runtime.data;
  }

  if (!runtime.loadingPromise) {
    runtime.loadingPromise = (async () => {
      const stored = await readJsonFile(STORE_FILENAME, {});
      runtime.data = stored && typeof stored === 'object' ? stored : {};
      runtime.loaded = true;
      runtime.loadingPromise = null;
      return runtime.data;
    })();
  }

  return runtime.loadingPromise;
}

async function persist() {
  runtime.persistQueue = runtime.persistQueue.catch(() => undefined).then(() =>
    writeJsonFile(STORE_FILENAME, runtime.data)
  );
  await runtime.persistQueue;
}

export async function getItemAsync(key) {
  const data = await ensureLoaded();
  return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
}

export async function setItemAsync(key, value) {
  const data = await ensureLoaded();
  data[key] = String(value);
  await persist();
}

export async function deleteItemAsync(key) {
  const data = await ensureLoaded();
  delete data[key];
  await persist();
}
