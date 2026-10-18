// What the worker precaches (ADR-0001 §12): the build's hashed scripts and styles only, as the
// site's paths. app/vite.config.ts computes it.
const HASHED = /^assets\/[\w.-]+-[\w-]{8,}\.(?:js|css)$/;

export function precacheList(fileNames: Iterable<string>): string[] {
  return [...fileNames]
    .filter((name) => HASHED.test(name))
    .map((name) => `/${name}`)
    .sort();
}
