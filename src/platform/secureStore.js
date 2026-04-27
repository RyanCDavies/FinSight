import * as SecureStore from 'expo-secure-store';

export async function getItemAsync(key) {
  return SecureStore.getItemAsync(key);
}

export async function setItemAsync(key, value) {
  return SecureStore.setItemAsync(key, value);
}

export async function deleteItemAsync(key) {
  return SecureStore.deleteItemAsync(key);
}
