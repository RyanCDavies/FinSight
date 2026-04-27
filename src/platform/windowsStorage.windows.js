import { NativeModules, TurboModuleRegistry } from 'react-native';

const windowsAppStorage =
  NativeModules.WindowsAppStorage ||
  (typeof TurboModuleRegistry?.get === 'function' ? TurboModuleRegistry.get('WindowsAppStorage') : null);

const fallbackStore = globalThis.__finsightWindowsFileStore || (globalThis.__finsightWindowsFileStore = {});

async function readTextFile(filename) {
  if (windowsAppStorage?.readText) {
    const value = await windowsAppStorage.readText(filename);
    return typeof value === 'string' ? value : '';
  }

  return Object.prototype.hasOwnProperty.call(fallbackStore, filename) ? fallbackStore[filename] : '';
}

async function writeTextFile(filename, text) {
  if (windowsAppStorage?.writeText) {
    await windowsAppStorage.writeText(filename, text);
    return;
  }

  fallbackStore[filename] = text;
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
