import { NativeModules, TurboModuleRegistry } from 'react-native';

const windowsOcrScanner =
  NativeModules.WindowsOcrScanner ||
  (typeof TurboModuleRegistry?.get === 'function' ? TurboModuleRegistry.get('WindowsOcrScanner') : null);

export async function scanTransactionImageAsync(mode = 'library') {
  if (!windowsOcrScanner?.scanImage) {
    throw new Error('Windows OCR scanning is unavailable in this build.');
  }

  return windowsOcrScanner.scanImage(mode);
}
