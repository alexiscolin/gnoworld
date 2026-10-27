// What the worker precaches (ADR-0001 §12, nuanced by the 2026-10-18 decision, F175): the build's hashed scripts
// and styles, of the fonts the latin faces, the text's and the code's, so that offline the page keeps its face
// (text in other scripts falls back to the system's font, F292); and its shell, the pages, their data, the
// manifest and the icon the pages link, so that the app opens with no network and a new tab opens the version
// before the click. app/vite.config.ts computes it. A hash is Vite's eight characters, dashes among them:
// "{8,}" took "-wght-normal" for one.
import { integrity } from "./digest.ts";
import type { Precached } from "./worker.ts";

const HASHED = /^assets\/(?:[\w.-]+-[\w-]{8}\.(?:js|css)|geist(?:-mono)?-latin-wght-normal-[\w-]{8}\.woff2)$/;

/** Whether a file of the build (a path from its folder, no leading slash) is a hashed script, style or font. */
export const isHashed = (name: string) => HASHED.test(name);

// The address a shell file answers at: a page is its folder's index.html, the fallback and the data are
// where they sit. A file under assets/ is no page or data.
function shellUrl(name: string): string | undefined {
  if (["__spa-fallback.html", "manifest.webmanifest", "icon.svg"].includes(name)) return `/${name}`;
  if (name === "index.html") return "/";
  const folder = /^(.+)\/index\.html$/.exec(name)?.[1];
  if (folder !== undefined) return folder === "assets" || folder.startsWith("assets/") ? undefined : `/${folder}`;
  return /^(?!assets\/).+\.data$/.test(name) ? `/${name}` : undefined;
}

function entries(fileNames: Iterable<string>): { url: string; file: string }[] {
  return [...fileNames]
    .flatMap((file) => {
      const url = isHashed(file) ? `/${file}` : shellUrl(file);
      return url === undefined ? [] : [{ url, file }];
    })
    .sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
}

export function precacheList(fileNames: Iterable<string>): string[] {
  return entries(fileNames).map(({ url }) => url);
}

/** The worker's list: each listed file with its digest, its bytes read by `read` from the build. */
export async function precached(
  fileNames: Iterable<string>,
  read: (file: string) => Uint8Array<ArrayBuffer>,
): Promise<Precached[]> {
  return Promise.all(
    entries(fileNames).map(async ({ url, file }) => ({ url, integrity: await integrity(read(file)) })),
  );
}
