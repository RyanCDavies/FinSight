import { NativeModules, TurboModuleRegistry } from 'react-native';

const windowsAppStorage =
  NativeModules.WindowsAppStorage ||
  (typeof TurboModuleRegistry?.get === 'function' ? TurboModuleRegistry.get('WindowsAppStorage') : null);

function normalizePath(filename) {
  return String(filename || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .trim();
}

export async function readJsonFile(filename, fallbackValue) {
  if (!windowsAppStorage?.readText) {
    return fallbackValue;
  }

  try {
    const text = await windowsAppStorage.readText(normalizePath(filename));
    if (!text) {
      return fallbackValue;
    }

    return JSON.parse(text);
  } catch (error) {
    console.warn(`Failed to read Windows app storage JSON from ${filename}:`, error);
    return fallbackValue;
  }
}

export async function writeJsonFile(filename, value) {
  if (!windowsAppStorage?.writeText) {
    return;
  }

  await windowsAppStorage.writeText(normalizePath(filename), JSON.stringify(value));
}
