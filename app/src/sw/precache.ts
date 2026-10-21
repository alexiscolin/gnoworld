// What the worker precaches (ADR-0001 §12): the build's hashed scripts and styles, and of the fonts
// the latin faces, the text's and the code's, so that offline the page keeps its face; text in other
// scripts falls back to the system's font (F292). app/vite.config.ts computes it. A hash is Vite's
// eight characters, dashes among them: "{8,}" took "-wght-normal" for one.
import { integrity } from "./digest.ts";
import type { Precached } from "./worker.ts";

const HASHED = /^assets\/(?:[\w.-]+-[\w-]{8}\.(?:js|css)|geist(?:-mono)?-latin-wght-normal-[\w-]{8}\.woff2)$/;

export function precacheList(fileNames: Iterable<string>): string[] {
  return [...fileNames]
    .filter((name) => HASHED.test(name))
    .map((name) => `/${name}`)
    .sort();
}

/** The worker's list: each listed file with its digest, its bytes read by `read` from the build. */
export async function precached(
  fileNames: Iterable<string>,
  read: (name: string) => Uint8Array<ArrayBuffer>,
): Promise<Precached[]> {
  return Promise.all(
    precacheList(fileNames).map(async (url) => ({ url, integrity: await integrity(read(url.slice(1))) })),
  );
}
