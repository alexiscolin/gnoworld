// What the worker precaches (ADR-0001 §12): the build's hashed scripts, styles and fonts only, as
// the site's paths, so that offline the page keeps its face. app/vite.config.ts computes it. A hash
// is Vite's eight characters, dashes among them: "{8,}" took "-wght-normal" for one.
const HASHED = /^assets\/[\w.-]+-[\w-]{8}\.(?:js|css|woff2)$/;

export function precacheList(fileNames: Iterable<string>): string[] {
  return [...fileNames]
    .filter((name) => HASHED.test(name))
    .map((name) => `/${name}`)
    .sort();
}
