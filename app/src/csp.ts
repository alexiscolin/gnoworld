// The site's Content-Security-Policy (ADR-0002 §9; slice 3's plan, 3f), written once at build time for
// every host: nothing loads unless named, nothing from another host but the accepted players' frames, no eval. React Router writes inline
// scripts in each pre-rendered page, so the build allows exactly those, by their SHA-256 (F341).
const SCRIPT_SRC = "script-src 'self'";
const DIRECTIVES = [
  // Covers every directive not named below, object-src among them.
  "default-src 'none'",
  SCRIPT_SRC,
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  // 'self' covers a WebSocket to the page's own host in CSP 3 (§1.3); MDN says not every browser does.
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  // The accepted services' players, each loaded on a click (slice 4's 4g; docs/decisions.md, 2026-10-26), by the
  // path of each one's player, not its whole host (F885); Imgur's form is not read yet.
  "frame-src https://www.youtube-nocookie.com/embed/ https://player.vimeo.com/video/ https://giphy.com/embed/",
  // These three fall back to nothing, not to default-src.
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];

// ponytail: one header for all pages, so it holds every page's script hashes: two per page, and a world has two pages
// since 5d (its path and its canonical address). 323 characters and 54 a hash: a host that caps a _headers line at 2,000
// (Cloudflare Pages) takes some 31 hashes, 7 worlds; nginx sets no cap. Per-page headers, through the host, past that (5f).
export function policy(hashes: readonly string[]): string {
  for (const hash of hashes) {
    if (!/^'sha256-[A-Za-z0-9+/]{43}='$/.test(hash)) throw new RangeError(`csp: ${hash} is no SHA-256 source`);
  }
  // Code units, not a locale's order: every machine writes the same policy.
  const scripts = [...new Set(hashes)].sort();
  const script = [SCRIPT_SRC, ...scripts].join(" ");
  return DIRECTIVES.map((directive) => (directive === SCRIPT_SRC ? script : directive)).join("; ");
}

// A tag's attributes as the HTML parser reads them: a > inside quotes ends nothing.
const ATTRIBUTES = String.raw`(?:[^>"']|"[^"]*"|'[^']*')*`;
// A script, its attributes, its text: it ends at the first `</script` that a space, a slash or a > follows.
const SCRIPT = String.raw`<script\b(${ATTRIBUTES})>([\s\S]*?)<\/script(?=[\s/>])[^>]*>`;

// What the browser hashes: the text between a script's tags, for each script that loads no file. An
// attribute starts after a space, a slash or a quote, as the HTML parser reads it.
export function inlineScripts(html: string): string[] {
  return (
    [...html.matchAll(new RegExp(SCRIPT, "gi"))]
      .filter(([, attributes = ""]) => !/[\s/"']src\s*=/i.test(attributes))
      // The parser turns CR LF and a lone CR into LF before a script's text is hashed.
      .map(([, , text = ""]) => text.replace(/\r\n?/g, "\n"))
  );
}

export async function sha256(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return `'sha256-${btoa(String.fromCharCode(...digest))}'`;
}

// A tag the policy would refuse in the browser: a style element, an inline handler or style, a
// javascript: URL. An attribute starts after a space, a slash or a quote, as the HTML parser reads it.
function refused(tag: string): boolean {
  return (
    /^<style\b/i.test(tag) ||
    /[\s/"'](?:on[a-z]+|style)\s*=/i.test(tag) ||
    /[\s/"'](?:href|src|action|formaction)\s*=\s*["']?\s*javascript:/i.test(tag)
  );
}

// The policy that every built page needs; the build stops on a page the policy would break in the
// browser rather than ship it.
export async function pagesPolicy(pages: readonly string[]): Promise<string> {
  if (pages.length === 0) throw new Error("csp: the build holds no page");
  for (const page of pages) {
    // A script's text is no markup.
    const markup = page.replace(new RegExp(SCRIPT, "gi"), "");
    for (const [tag = ""] of markup.matchAll(new RegExp(`<[a-z]${ATTRIBUTES}>`, "gi"))) {
      if (refused(tag)) throw new Error(`csp: a page holds ${tag.slice(0, 40)}, which the policy refuses`);
    }
  }
  return policy(await Promise.all(pages.flatMap(inlineScripts).map(sha256)));
}

// The policy as a host that reads `_headers` takes it, and as nginx's include sets it on every answer.
export function outputs(csp: string): { headers: string; nginx: string } {
  if (/["$\\\r\n]/.test(csp)) throw new RangeError("csp: a policy holds no quote, $, backslash or line break");
  return {
    headers: `/*\n  Content-Security-Policy: ${csp}\n`,
    nginx: `add_header Content-Security-Policy "${csp}" always;\n`,
  };
}
