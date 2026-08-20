import { loadAdapters } from './loader.js';

export async function register(registry) {
  return loadAdapters(registry);
}
