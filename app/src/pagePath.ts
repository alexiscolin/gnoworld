// F326: which of the site's paths the router answers. The catch-all route says "No page here" to every path, so a path
// that names a file (the sitemap, the manifest, a script) must reach the host as a plain anchor.
const FILE = /\.[^/.]+$/;

/** True for a path whose last segment has no extension; the query and the hash are no part of it. */
export function isPagePath(href: string): boolean {
  return !FILE.test(href.split(/[?#]/, 1)[0] ?? "");
}
