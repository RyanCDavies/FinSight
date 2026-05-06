import { NativeModules, TurboModuleRegistry } from 'react-native';

const windowsOcrScanner =
  NativeModules.WindowsOcrScanner ||
  (typeof TurboModuleRegistry?.get === 'function' ? TurboModuleRegistry.get('WindowsOcrScanner') : null);

export async function scanTransactionImageAsync(mode = 'library') {
  if (mode === 'camera') {
    throw new Error('Taking a photo directly in the Windows app is not supported. Please choose an existing receipt image to scan.');
  }

  if (!windowsOcrScanner?.scanImage) {
    throw new Error('Windows OCR scanning is unavailable in this build.');
  }

  return windowsOcrScanner.scanImage('library');
}
