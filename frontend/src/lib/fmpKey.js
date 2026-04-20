const STORAGE_KEY = 'fmp-api-key-v1';

export function getFmpKey() {
  try {
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function setFmpKey(key) {
  try {
    if (key) {
      localStorage.setItem(STORAGE_KEY, key);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // localStorage unavailable
  }
}

export function hasFmpKey() {
  return !!getFmpKey();
}

export function getMaskedKey() {
  const key = getFmpKey();
  if (!key || key.length < 4) return null;
  return '****' + key.slice(-4).toUpperCase();
}
