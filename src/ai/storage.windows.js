import { readJsonFile, writeJsonFile } from '../platform/windowsStorage';

const CURRENT_METADATA_FILE = 'ai/current/metadata.json';
const PREVIOUS_METADATA_FILE = 'ai/previous/metadata.json';
const MANIFEST_FILE = 'ai/manifest.json';
const STATUS_FILE = 'ai/status.json';
const TEMP_DOWNLOAD_FILE = 'ai/temp/model.download';

function currentPackagePath(metadata) {
  return metadata ? `ai/current/${metadata.fileName}` : null;
}

function previousPackagePath(metadata) {
  return metadata ? `ai/previous/${metadata.fileName}` : null;
}

export const AIStorage = {
  paths: {
    rootDir: 'ai',
    currentDir: 'ai/current',
    previousDir: 'ai/previous',
    tempDir: 'ai/temp',
    manifestFile: MANIFEST_FILE,
    statusFile: STATUS_FILE,
    currentMetadataFile: CURRENT_METADATA_FILE,
    previousMetadataFile: PREVIOUS_METADATA_FILE,
    tempDownloadFile: TEMP_DOWNLOAD_FILE,
  },

  async ensureLayout() {},

  async readManifest() {
    return readJsonFile(MANIFEST_FILE, null);
  },

  async writeManifest(manifest) {
    await writeJsonFile(MANIFEST_FILE, manifest);
  },

  async readStatus() {
    return readJsonFile(STATUS_FILE, { state: 'not-installed' });
  },

  async writeStatus(status) {
    await writeJsonFile(STATUS_FILE, status);
  },

  async readCurrentMetadata() {
    return readJsonFile(CURRENT_METADATA_FILE, null);
  },

  async writeCurrentMetadata(metadata) {
    await writeJsonFile(CURRENT_METADATA_FILE, metadata);
  },

  async readPreviousMetadata() {
    return readJsonFile(PREVIOUS_METADATA_FILE, null);
  },

  async writePreviousMetadata(metadata) {
    await writeJsonFile(PREVIOUS_METADATA_FILE, metadata);
  },

  async clearPrevious() {
    await writeJsonFile(PREVIOUS_METADATA_FILE, null);
  },

  async removeCurrent() {
    const existingCurrent = await this.readCurrentMetadata();
    if (existingCurrent) {
      await writeJsonFile(currentPackagePath(existingCurrent), null);
    }
    await writeJsonFile(CURRENT_METADATA_FILE, null);
    await this.writeStatus({ state: 'not-installed' });
  },

  async promoteTempToCurrent(tempModelFile, metadata) {
    const existingCurrent = await this.readCurrentMetadata();
    if (existingCurrent) {
      await this.writePreviousMetadata(existingCurrent);
      await writeJsonFile(previousPackagePath(existingCurrent), await readJsonFile(currentPackagePath(existingCurrent), null));
    }

    await writeJsonFile(currentPackagePath(metadata), await readJsonFile(tempModelFile, null));
    await this.writeCurrentMetadata(metadata);
    await this.writeStatus({
      state: 'installed',
      modelId: metadata.id,
      version: metadata.version,
    });
  },

  async getCurrentModelFile(metadata) {
    if (!metadata) return null;
    return `ai/current/${metadata.fileName}`;
  },

  async getTempModelFile() {
    return TEMP_DOWNLOAD_FILE;
  },

  async writeTempPackage(_model, payload) {
    await writeJsonFile(TEMP_DOWNLOAD_FILE, payload);
    return TEMP_DOWNLOAD_FILE;
  },

  async readCurrentPackage(metadata) {
    return readJsonFile(currentPackagePath(metadata), null);
  },

  async deleteTemp() {
    await writeJsonFile(TEMP_DOWNLOAD_FILE, null);
  },
};
