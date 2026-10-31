// The site's Content-Security-Policy (ADR-0002 §9; slice 3's plan, 3f), written once at build time for
// every host: nothing loads unless named, nothing from another host but the accepted players' frames, no eval. React Router writes inline
// scripts in each pre-rendered page, so the build allows exactly those, by their SHA-256 (F341).
import { formOf } from "./cspForms.ts";

import { connectSrc, originsOf } from "./cspOrigins.ts";

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

// A page's policy holds its own scripts' hashes alone (5f), and the RPC origins connect-src names (5g, cspOrigins.ts): about 600
// characters a page, some 20 worlds under Cloudflare Pages' 2,000-character line and 100 rules (F2452). A page's JSON-LD (5e)
// is a data block and has no hash.
export function policy(hashes: readonly string[], origins: readonly string[] = []): string {
  for (const hash of hashes) {
    if (!/^'sha256-[A-Za-z0-9+/]{43}='$/.test(hash)) throw new RangeError(`csp: ${hash} is no SHA-256 source`);
  }
  // Code units, not a locale's order: every machine writes the same policy.
  const scripts = [...new Set(hashes)].sort();
  const script = [SCRIPT_SRC, ...scripts].join(" ");
  const connect = connectSrc(origins);
  return DIRECTIVES.map((directive) =>
    directive === SCRIPT_SRC ? script : directive.startsWith("connect-src") ? connect : directive,
  ).join("; ");
}

// The guards below are built inside functions, never as module-level constants: StrykerJS leaves a module-level constant
// unmutated (ignoreStatic), so a guard written there is one no test is measured against (.claude/rules/typescript.md, F412).

// A tag's attributes as the HTML parser reads them: a > inside quotes ends nothing.
function attributesSource(): string {
  return /(?:[^>"']|"[^"]*"|'[^']*')*/.source;
}

// A script, its attributes, its text: it ends at the first `</script` that a space, a slash or a > follows.
function scriptTags(): RegExp {
  return new RegExp(String.raw`<script\b(${attributesSource()})>([\s\S]*?)<\/script(?=[\s/>])[^>]*>`, "gi");
}

// The attributes of a tag by name, the first of a repeated one, as the HTML parser keeps it: a name inside another attribute's
// value is no attribute (F2360).
function attributesOf(attributes: string): Map<string, string> {
  const found = new Map<string, string>();
  // One attribute: its name (a slash, a space or a quote starts the next), then its value, quoted or not.
  const attribute = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  for (const [, name = "", double, single, bare] of attributes.matchAll(attribute)) {
    const key = name.toLowerCase();
    if (!found.has(key)) found.set(key, double ?? single ?? bare ?? "");
  }
  return found;
}

// What the browser hashes: the text between a script's tags, for each script that loads no file and runs. A script whose type is
// JSON-LD is a data block, which the browser never runs, so the policy has no hash to give it.
export function inlineScripts(html: string): string[] {
  return (
    [...html.matchAll(scriptTags())]
      .filter(([, attributes = ""]) => {
        const found = attributesOf(attributes);
        return !found.has("src") && (found.get("type") ?? "").trim().toLowerCase() !== "application/ld+json";
      })
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

// A page's markup, scripts aside (a script's text is no markup), holds no tag the policy would refuse.
function refuseMarkup(page: string): void {
  const markup = page.replace(scriptTags(), "");
  for (const [tag = ""] of markup.matchAll(new RegExp(`<[a-z]${attributesSource()}>`, "gi"))) {
    if (refused(tag)) throw new Error(`csp: a page holds ${tag.slice(0, 40)}, which the policy refuses`);
  }
}

// The policy of each built page (a key is its file under build/client), holding its own scripts' hashes alone; the build stops
// on a page the policy would break in the browser, or on a script that is none of React Router's, rather than ship it.
export async function pagePolicies(
  pages: Readonly<Record<string, string>>,
  origins: readonly string[] = [],
): Promise<Record<string, string>> {
  const files = Object.keys(pages).sort();
  if (files.length === 0) throw new Error("csp: the build holds no page");
  const policies: Record<string, string> = {};
  for (const file of files) {
    const page = pages[file] ?? "";
    refuseMarkup(page);
    const scripts = inlineScripts(page);
    // F2450: each form once, in React Router's order (the fallback page has no scroll restoration): a second one, well formed,
    // is a planted script. A page that holds fewer is no harm.
    let last = -1;
    for (const text of scripts) {
      const form = formOf(text);
      if (form < 0)
        throw new Error(
          `csp: ${file} holds a script that is none of React Router's: ${JSON.stringify(text.slice(0, 40))}`,
        );
      if (form <= last)
        throw new Error(
          `csp: ${file} holds a React Router script twice or out of order: ${JSON.stringify(text.slice(0, 40))}`,
        );
      last = form;
    }
    policies[file] = policy(await Promise.all(scripts.map(sha256)), origins);
  }
  return policies;
}

const HEADER = "  Content-Security-Policy: ";
// A host that reads _headers cuts a line past this many characters (Cloudflare Pages).
const HEADER_CAP = 2000;
const FILE_ERROR = "csp: a page's name holds only a-z, 0-9, /, ., _ and -";

// The addresses a host answers a page at: for _headers, the paths asked; for nginx's table, $uri, which is the path asked
// until try_files (a 401 answers before it), then the file it serves, joined without merging slashes: `/w/bubble/` is
// served from `/w/bubble//index.html` (deploy/web/nginx.conf's `try_files $uri $uri/index.html`, F2460).
function addresses(file: string): { headers: string[]; nginx: string[] } {
  if (file === "index.html") return { headers: ["/"], nginx: ["/", "//index.html", "/index.html"] };
  if (file.endsWith("/index.html")) {
    const path = `/${file.slice(0, -"/index.html".length)}`;
    return { headers: [path, `${path}/`], nginx: [path, `${path}/`, `${path}//index.html`, `/${file}`] };
  }
  return { headers: [`/${file}`], nginx: [`/${file}`] };
}

// The next power of two from `from` that is at least `least`: nginx rounds its hash sizes.
function sized(from: number, least: number): number {
  let size = from;
  while (size < least) size *= 2;
  return size;
}

// A page's policy as a host would read it: no character that ends a quote or a line, and a header the host does not cut.
function checked(file: string, csp: string): string {
  if (/["$\\\r\n]/.test(csp)) throw new RangeError("csp: a policy holds no quote, $, backslash or line break");
  const length = HEADER.length + csp.length;
  if (length >= HEADER_CAP)
    throw new RangeError(
      `csp: the policy of ${file} makes a header of ${String(length)} characters, past a host's 2,000`,
    );
  return csp;
}

// The rows of an output, each as `line` writes it, in code-unit order of their paths, not a locale's: every machine writes the
// same bytes. The one place an output is sorted.
function rows(found: [string, string][], line: (path: string, csp: string) => string): string {
  return found
    .slice()
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([path, csp]) => line(path, csp))
    .join("");
}

// The map's hash sizes (ngx_hash_init, nginx 1.30 src/core/ngx_hash.c): a key takes a pointer, then its length and bytes rounded
// up to a pointer; a bucket holds four of the longest and the pointer that ends it, and the table four slots a key (F2454).
function hashSizes(table: readonly [string, string][]): string {
  const pointer = 8;
  const longest = Math.max(0, ...table.map(([path]) => pointer + Math.ceil((path.length + 2) / pointer) * pointer));
  return `map_hash_max_size ${String(sized(2048, 4 * table.length))};\nmap_hash_bucket_size ${String(sized(64, 4 * longest + pointer))};\n`;
}

// A host that reads _headers takes this many rules (Cloudflare Pages: developers.cloudflare.com/pages/configuration/headers).
const RULE_CAP = 100;
const DETACH = "  ! Content-Security-Policy\n";

function refuseRules(rules: number, cap: number): void {
  if (rules > cap) throw new RangeError(`csp: _headers holds ${String(rules)} rules, past a host's ${String(cap)}`);
}

// The policy of a path no page names (F2451): a host without a 404 page answers it with the home, one with the fallback
// answers it with that, so it names the scripts of both and their connect origins, and nothing else.
function anywhere(policies: Readonly<Record<string, string>>): string {
  const documents = ["index.html", "__spa-fallback.html"];
  const found = documents.map((name) => policies[name] ?? "");
  return policy(
    found.flatMap((csp) => csp.match(/'sha256-[A-Za-z0-9+/]{43}='/g) ?? []),
    found.flatMap(originsOf),
  );
}

// The policies as `_headers` takes them (the catch-all `/*` first; every other rule detaches it, then sets its own), and as
// nginx's map of the answer's path: a page has its own, any other answer the bare one, as does each of `workers` (the service
// worker's script): they fetch no RPC, so 'self' alone (docs/decisions.md, 2026-10-31).
export function outputs(
  policies: Readonly<Record<string, string>>,
  workers: readonly string[] = [],
  // Past it the build stops; the nginx table's own sizing is tested past it.
  ruleCap = RULE_CAP,
): { headers: string; nginx: string } {
  const files = Object.keys(policies).sort();
  for (const name of [...files, ...workers]) if (!/^[a-z0-9/._-]+$/.test(name)) throw new RangeError(FILE_ERROR);
  const headers: [string, string][] = [];
  const table: [string, string][] = [];
  for (const file of files) {
    const csp = checked(file, policies[file] ?? "");
    const where = addresses(file);
    for (const path of where.headers) headers.push([path, csp]);
    for (const path of where.nginx) table.push([path, csp]);
  }
  const bare = policy([]);
  for (const worker of workers) headers.push([`/${worker}`, bare]);
  refuseRules(headers.length + 1, ruleCap);
  return {
    headers:
      `/*\n${HEADER}${checked("/*", anywhere(policies))}\n` +
      rows(headers, (path, csp) => `${path}\n${DETACH}${HEADER}${csp}\n`),
    nginx: `${hashSizes(table)}map $uri $csp {\n    default "${bare}";\n${rows(table, (path, csp) => `    "${path}" "${csp}";\n`)}}\n`,
  };
}
