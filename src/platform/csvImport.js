import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

export async function pickCsvTextAsync() {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'text/comma-separated-values',
    copyToCacheDirectory: true,
  });

  if (result.canceled) {
    return null;
  }

  const text = await new File(result.assets[0].uri).text();
  return {
    name: result.assets[0].name,
    text,
  };
}

export function setCsvDropEnabled() {}

export function addCsvDropListener() {
  return { remove() {} };
}
