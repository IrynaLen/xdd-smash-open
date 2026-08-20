import { readFileSync } from 'node:fs';

export const indent = {
  i2: ' '.repeat(2),
  i4: ' '.repeat(4),
};

export function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

// Arrays and nulls replace, they never merge.
export function mergeConfig(base, over) {
  if (over === undefined) return base;
  if (!isPlainObject(base) || !isPlainObject(over)) return over;

  const out = { ...base };
  for (const [key, value] of Object.entries(over)) out[key] = mergeConfig(base[key], value);
  return out;
}

export function setPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (cur[key] === null || cur[key] === undefined || typeof cur[key] !== 'object') {
      cur[key] = {};
    }
    cur = cur[key];
  }
  cur[parts[parts.length - 1]] = value;
}
