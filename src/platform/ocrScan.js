import * as ImagePicker from 'expo-image-picker';
import TextRecognition from '@react-native-ml-kit/text-recognition';

async function ensurePermission(mode) {
  if (mode === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new Error('Camera permission is required to take a photo.');
    }
    return;
  }

  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Photo library permission is required to choose an image.');
  }
}

async function launchPicker(mode) {
  await ensurePermission(mode);

  const options = {
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 1,
    base64: false,
  };

  if (mode === 'camera') {
    return ImagePicker.launchCameraAsync(options);
  }

  return ImagePicker.launchImageLibraryAsync(options);
}

export async function scanTransactionImageAsync(mode = 'library') {
  const result = await launchPicker(mode);
  if (!result || result.canceled || !result.assets?.length) {
    return null;
  }

  const asset = result.assets[0];
  const recognized = await TextRecognition.recognize(asset.uri);

  return {
    imageUri: asset.uri,
    fileName: asset.fileName || null,
    width: asset.width || null,
    height: asset.height || null,
    mode,
    text: String(recognized?.text || '').trim(),
  };
}
