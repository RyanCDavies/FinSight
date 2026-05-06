import { NativeModules, TurboModuleRegistry } from 'react-native';

const windowsAppStorage =
  NativeModules.WindowsAppStorage ||
  (typeof TurboModuleRegistry?.get === 'function' ? TurboModuleRegistry.get('WindowsAppStorage') : null);

const fallbackStore = globalThis.__finsightWindowsFileStore || (globalThis.__finsightWindowsFileStore = {});

function normalizeStorageFilename(filename) {
  return String(filename || '')
    .replace(/[\\/]+/g, '__')
    .replace(/[^A-Za-z0-9_.-]/g, '_');
}

async function readTextFile(filename) {
  const storageFilename = normalizeStorageFilename(filename);

  if (windowsAppStorage?.readText) {
    const value = await windowsAppStorage.readText(storageFilename);
    return typeof value === 'string' ? value : '';
  }

  return Object.prototype.hasOwnProperty.call(fallbackStore, storageFilename) ? fallbackStore[storageFilename] : '';
}

async function writeTextFile(filename, text) {
  const storageFilename = normalizeStorageFilename(filename);

  if (windowsAppStorage?.writeText) {
    await windowsAppStorage.writeText(storageFilename, text);
    return;
  }

  fallbackStore[storageFilename] = text;
}

export async function readJsonFile(filename, fallbackValue) {
  try {
    const text = await readTextFile(filename);
    if (!text) return fallbackValue;
    return JSON.parse(text);
  } catch (error) {
    console.warn(`Failed to read ${filename}:`, error);
    return fallbackValue;
  }
}

export async function writeJsonFile(filename, value) {
  await writeTextFile(filename, JSON.stringify(value));
}
