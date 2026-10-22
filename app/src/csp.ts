// The site's Content-Security-Policy (ADR-0002 §9; slice 3's plan, 3f), written once at build time for
// every host: nothing loads unless named, nothing from another host, no eval. React Router writes inline
// scripts in each pre-rendered page, so the build allows exactly those, by their SHA-256 (F341).
const DIRECTIVES = [
  // Covers frame-src and object-src too, which the planted frame proves.
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  // 'self' covers a WebSocket to the page's own host in CSP 3 (§1.3); MDN says not every browser does.
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  // These three fall back to nothing, not to default-src.
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];

// ponytail: one header for all pages, so it holds every page's script hashes: a few per page, three
// pages now. Per-page headers, through the host, if the worlds grow to hundreds.
export function policy(hashes: readonly string[]): string {
  for (const hash of hashes) {
    if (!/^'sha256-[A-Za-z0-9+/]{43}='$/.test(hash)) throw new RangeError(`csp: ${hash} is no SHA-256 source`);
  }
  // Code units, not a locale's order: every machine writes the same policy.
  const scripts = [...new Set(hashes)].sort();
  return DIRECTIVES.map((directive) =>
    directive === "script-src 'self'" ? [directive, ...scripts].join(" ") : directive,
  ).join("; ");
}

// What the browser hashes: the text between a script's tags, for each script that loads no file. A
// script ends at the first `</script` that a space, a slash or a > follows, as the HTML parser reads it.
export function inlineScripts(html: string): string[] {
  const scripts = /<script\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script(?=[\s/>])[^>]*>/gi;
  return [...html.matchAll(scripts)]
    .filter(([, attributes = ""]) => !/(?:^|\s)src\s*=/i.test(attributes))
    .map(([, , text = ""]) => text);
}

export async function sha256(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return `'sha256-${btoa(String.fromCharCode(...digest))}'`;
}

// The policy that every built page needs; the build stops on a page the policy would break in the
// browser, an inline handler or style, rather than ship it.
export async function pagesPolicy(pages: readonly string[]): Promise<string> {
  if (pages.length === 0) throw new Error("csp: the build holds no page");
  for (const page of pages) {
    for (const [tag = ""] of page.matchAll(/<[a-z][^>]*>/gi)) {
      // An attribute starts after a space, a slash or a quote, as the HTML parser reads a tag.
      if (/^<style\b/i.test(tag) || /[\s/"'](?:on[a-z]+|style)\s*=/i.test(tag)) {
        throw new Error(`csp: a page holds ${tag.slice(0, 40)}, which the policy refuses`);
      }
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
