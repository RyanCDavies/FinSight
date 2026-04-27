const listeners = globalThis.__finsightDataListeners || (globalThis.__finsightDataListeners = new Set());

export function subscribeToDataChanges(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitDataChanged() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.warn('Data change listener failed:', error);
    }
  });
}
