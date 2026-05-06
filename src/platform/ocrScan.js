import * as ImagePicker from 'expo-image-picker';

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
  let text = '';

  try {
    const { recognizeText } = await import('@infinitered/react-native-mlkit-text-recognition');
    const recognized = await recognizeText(asset.uri);
    text = String(recognized?.text || '').trim();
  } catch (error) {
    const message = String(error?.message || '');
    if (/native module|cannot find native module|RNMLKitTextRecognition|development build|expo go/i.test(message)) {
      throw new Error(
        'Receipt scanning requires a native Expo development build so the on-device OCR module can be included. Expo Go does not bundle this scanner.'
      );
    }
    throw error;
  }

  return {
    imageUri: asset.uri,
    fileName: asset.fileName || null,
    width: asset.width || null,
    height: asset.height || null,
    mode,
    text,
  };
}
