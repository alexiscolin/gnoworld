// What the worker precaches (ADR-0001 §12): the build's hashed scripts and styles only, as the
// site's paths, and a version that changes with them. app/vite.config.ts computes both.
const HASHED = /^assets\/[\w.-]+-[\w-]{8,}\.(?:js|css)$/;

export function precacheList(fileNames: Iterable<string>): string[] {
  return [...fileNames]
    .filter((name) => HASHED.test(name))
    .map((name) => `/${name}`)
    .sort((a, b) => (a < b ? -1 : 1));
}

// FNV-1a over the list as JSON, so no two lists share a text: a cache's name, not a secret.
export function cacheVersion(list: readonly string[]): string {
  let hash = 0x811c9dc5;
  for (const char of JSON.stringify(list)) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0;
  return hash.toString(16).padStart(8, "0");
}
