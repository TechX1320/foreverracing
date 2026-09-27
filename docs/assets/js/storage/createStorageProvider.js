import { ApiStorageProvider } from './ApiStorageProvider.js';
import { LocalStorageProvider } from './LocalStorageProvider.js';

export function createStorageProvider() {
  const configuredMode = String(document.documentElement.dataset.storageMode || 'api').toLowerCase();
  return configuredMode === 'local'
    ? new LocalStorageProvider()
    : new ApiStorageProvider();
}
