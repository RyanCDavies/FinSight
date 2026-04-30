import { NativeEventEmitter, NativeModules, TurboModuleRegistry } from 'react-native';

const windowsCsvPicker =
  NativeModules.WindowsCsvPicker ||
  (typeof TurboModuleRegistry?.get === 'function' ? TurboModuleRegistry.get('WindowsCsvPicker') : null);

const windowsCsvPickerEmitter =
  windowsCsvPicker &&
  typeof NativeEventEmitter === 'function' &&
  typeof windowsCsvPicker.addListener === 'function'
    ? new NativeEventEmitter(windowsCsvPicker)
    : null;

export async function pickCsvTextAsync() {
  if (!windowsCsvPicker?.pickCsvText) {
    return null;
  }

  return windowsCsvPicker.pickCsvText();
}

export function setCsvDropEnabled(enabled) {
  if (!windowsCsvPicker?.setDropEnabled) return;
  windowsCsvPicker.setDropEnabled(enabled);
}

export function addCsvDropListener(listener) {
  if (!windowsCsvPickerEmitter) {
    return { remove() {} };
  }

  return windowsCsvPickerEmitter.addListener('WindowsCsvPickerDrop', listener);
}
