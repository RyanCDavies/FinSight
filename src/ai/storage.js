import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { readJsonFile, writeJsonFile } from '../platform/windowsStorage';

const AI_ROOT_DIR = `${FileSystem.documentDirectory || ''}ai`;
const CURRENT_DIR = `${AI_ROOT_DIR}/current`;
const PREVIOUS_DIR = `${AI_ROOT_DIR}/previous`;
const TEMP_DIR = `${AI_ROOT_DIR}/temp`;
const MANIFEST_FILE = `${AI_ROOT_DIR}/manifest.json`;
const STATUS_FILE = `${AI_ROOT_DIR}/status.json`;
const CURRENT_METADATA_FILE = `${CURRENT_DIR}/metadata.json`;
const PREVIOUS_METADATA_FILE = `${PREVIOUS_DIR}/metadata.json`;
const TEMP_DOWNLOAD_FILE = `${TEMP_DIR}/model.download`;

function isWindowsStorageShim() {
  return Platform.OS === 'windows' || !FileSystem.documentDirectory;
}

async function ensureDirectory(path) {
  if (isWindowsStorageShim()) return;

  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  }
}

async function ensureLayout() {
  if (isWindowsStorageShim()) return;

  await ensureDirectory(AI_ROOT_DIR);
  await ensureDirectory(CURRENT_DIR);
  await ensureDirectory(PREVIOUS_DIR);
  await ensureDirectory(TEMP_DIR);
}

async function readJson(path, fallbackValue) {
  if (isWindowsStorageShim()) {
    return readJsonFile(path.replace(/^.*ai[\\/]/, 'ai/'), fallbackValue);
  }

  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return fallbackValue;
    const text = await FileSystem.readAsStringAsync(path);
    return text ? JSON.parse(text) : fallbackValue;
  } catch (error) {
    console.warn(`Failed to read AI JSON from ${path}:`, error);
    return fallbackValue;
  }
}

async function writeJson(path, value) {
  if (isWindowsStorageShim()) {
    await writeJsonFile(path.replace(/^.*ai[\\/]/, 'ai/'), value);
    return;
  }

  await ensureLayout();
  await FileSystem.writeAsStringAsync(path, JSON.stringify(value));
}

async function deletePath(path, options = {}) {
  if (isWindowsStorageShim()) {
    const replacement = options.directory ? {} : null;
    await writeJsonFile(path.replace(/^.*ai[\\/]/, 'ai/'), replacement);
    return;
  }

  const info = await FileSystem.getInfoAsync(path);
  if (info.exists) {
    await FileSystem.deleteAsync(path, { idempotent: true });
  }
}

async function movePath(from, to) {
  if (isWindowsStorageShim()) {
    const value = await readJson(from.replace(/^.*ai[\\/]/, 'ai/'), null);
    await writeJsonFile(to.replace(/^.*ai[\\/]/, 'ai/'), value);
    await writeJsonFile(from.replace(/^.*ai[\\/]/, 'ai/'), null);
    return;
  }

  const info = await FileSystem.getInfoAsync(from);
  if (!info.exists) return;
  await ensureLayout();
  const destinationInfo = await FileSystem.getInfoAsync(to);
  if (destinationInfo.exists) {
    await FileSystem.deleteAsync(to, { idempotent: true });
  }
  await FileSystem.moveAsync({ from, to });
}

export const AIStorage = {
  paths: {
    rootDir: AI_ROOT_DIR,
    currentDir: CURRENT_DIR,
    previousDir: PREVIOUS_DIR,
    tempDir: TEMP_DIR,
    manifestFile: MANIFEST_FILE,
    statusFile: STATUS_FILE,
    currentMetadataFile: CURRENT_METADATA_FILE,
    previousMetadataFile: PREVIOUS_METADATA_FILE,
    tempDownloadFile: TEMP_DOWNLOAD_FILE,
  },

  async ensureLayout() {
    await ensureLayout();
  },

  async readManifest() {
    return readJson(MANIFEST_FILE, null);
  },

  async writeManifest(manifest) {
    await writeJson(MANIFEST_FILE, manifest);
  },

  async readStatus() {
    return readJson(STATUS_FILE, { state: 'not-installed' });
  },

  async writeStatus(status) {
    await writeJson(STATUS_FILE, status);
  },

  async readCurrentMetadata() {
    return readJson(CURRENT_METADATA_FILE, null);
  },

  async writeCurrentMetadata(metadata) {
    await writeJson(CURRENT_METADATA_FILE, metadata);
  },

  async readPreviousMetadata() {
    return readJson(PREVIOUS_METADATA_FILE, null);
  },

  async writePreviousMetadata(metadata) {
    await writeJson(PREVIOUS_METADATA_FILE, metadata);
  },

  async clearPrevious() {
    if (isWindowsStorageShim()) {
      await writeJson(PREVIOUS_METADATA_FILE, null);
      return;
    }

    await deletePath(PREVIOUS_DIR);
    await ensureDirectory(PREVIOUS_DIR);
  },

  async removeCurrent() {
    if (isWindowsStorageShim()) {
      await writeJson(CURRENT_METADATA_FILE, null);
      await this.writeStatus({ state: 'not-installed' });
      return;
    }

    await deletePath(CURRENT_DIR);
    await ensureDirectory(CURRENT_DIR);
    await this.writeStatus({ state: 'not-installed' });
  },

  async promoteTempToCurrent(tempModelFile, metadata) {
    if (isWindowsStorageShim()) {
      await this.writeCurrentMetadata(metadata);
      await this.writeStatus({ state: 'installed', modelId: metadata.id, version: metadata.version });
      return;
    }

    await ensureLayout();
    const existingCurrent = await FileSystem.getInfoAsync(CURRENT_METADATA_FILE);
    if (existingCurrent.exists) {
      await deletePath(PREVIOUS_DIR);
      await ensureDirectory(PREVIOUS_DIR);
      const currentFiles = await FileSystem.readDirectoryAsync(CURRENT_DIR);
      for (const file of currentFiles) {
        await movePath(`${CURRENT_DIR}/${file}`, `${PREVIOUS_DIR}/${file}`);
      }
    }

    await deletePath(CURRENT_DIR);
    await ensureDirectory(CURRENT_DIR);
    await movePath(tempModelFile, `${CURRENT_DIR}/${metadata.fileName}`);
    await writeJson(CURRENT_METADATA_FILE, metadata);
    await this.writeStatus({ state: 'installed', modelId: metadata.id, version: metadata.version });
  },

  async getCurrentModelFile(metadata) {
    if (!metadata) return null;
    if (isWindowsStorageShim()) return `ai/current/${metadata.fileName}`;
    return `${CURRENT_DIR}/${metadata.fileName}`;
  },

  async getTempModelFile(model) {
    if (isWindowsStorageShim()) return TEMP_DOWNLOAD_FILE;
    await ensureLayout();
    const extension = String(model.fileName || 'model.bin').split('.').pop();
    return `${TEMP_DIR}/${model.id}.${extension}`;
  },

  async deleteTemp() {
    if (isWindowsStorageShim()) return;
    await deletePath(TEMP_DIR);
    await ensureDirectory(TEMP_DIR);
  },
};
