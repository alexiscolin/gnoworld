// F326: which of the site's paths the router answers. The catch-all route says "No page here" to every path, so a path
// that names a file (the sitemap, the manifest, a script) must reach the host as a plain anchor.
const FILE = /\.[^/.]+$/;

/** True for a path whose last segment has no extension; the query and the hash are no part of it. */
export function isPagePath(href: string): boolean {
  return !FILE.test(href.split(/[?#]/, 1)[0] ?? "");
}

/** True for a path of the site's own pages: from its root, never another host's (`//host`, `/\\host`, a tab the address parser drops), no
 * space and no escaped slash, a page and not a file (7v: what the Plan's names hand the router). */
export function isOwnPage(href: string): boolean {
  return /^\/(?![/\\])[^\s\\]*$/.test(href) && !/%2f|%5c/i.test(href) && isPagePath(href);
}
