import { NativeModules, TurboModuleRegistry } from 'react-native';

const windowsOcrScanner =
  NativeModules.WindowsOcrScanner ||
  (typeof TurboModuleRegistry?.get === 'function' ? TurboModuleRegistry.get('WindowsOcrScanner') : null);

export async function scanTransactionImageAsync(mode = 'library') {
  if (mode === 'camera') {
    throw new Error('Direct camera capture is currently unavailable on Windows in this build. Please take the photo with the Windows Camera app, then choose the saved image to scan.');
  }

  if (!windowsOcrScanner?.scanImage) {
    throw new Error('Windows OCR scanning is unavailable in this build.');
  }

  return windowsOcrScanner.scanImage('library');
}
