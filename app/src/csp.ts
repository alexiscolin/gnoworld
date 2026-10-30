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

// A page's policy holds its own scripts' hashes alone (5f): five a page, some 600 characters whatever the number of pages.
// One policy for all of them took some 7 worlds under Cloudflare Pages' 2,000-character line; its 100 rules take about 20
// worlds (F2452). A page's JSON-LD (5e) is a data block and has no hash.
export function policy(hashes: readonly string[]): string {
  for (const hash of hashes) {
    if (!/^'sha256-[A-Za-z0-9+/]{43}='$/.test(hash)) throw new RangeError(`csp: ${hash} is no SHA-256 source`);
  }
  // Code units, not a locale's order: every machine writes the same policy.
  const scripts = [...new Set(hashes)].sort();
  const script = [SCRIPT_SRC, ...scripts].join(" ");
  return DIRECTIVES.map((directive) => (directive === SCRIPT_SRC ? script : directive)).join("; ");
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

// The inline scripts React Router 8.4.0 writes in a page, and no other (F475): a script planted in a page fails the build
// instead of being allowed by its hash. Copied from a build (cspFixture.ts); an upgrade that changes one stops the build until
// it is read again. What varies (a JSON, a string, a file name) is checked as data.
const SCROLL_RESTORATION =
  '((storageKey, restoreKey) => {\n\t\tif (!window.history.state || !window.history.state.key) {\n\t\t\tlet key = Math.random().toString(32).slice(2);\n\t\t\twindow.history.replaceState({ key }, "");\n\t\t}\n\t\ttry {\n\t\t\tlet storedY = JSON.parse(sessionStorage.getItem(storageKey) || "{}")[restoreKey || window.history.state.key];\n\t\t\tif (typeof storedY === "number") window.scrollTo(0, storedY);\n\t\t} catch (error) {\n\t\t\tconsole.error(error);\n\t\t\tsessionStorage.removeItem(storageKey);\n\t\t}\n\t})("react-router-scroll-positions", null)';
const STREAM_CLOSE = "window.__reactRouterContext.streamController.close();";
const CONTEXT_HEAD = "window.__reactRouterContext = ";
const CONTEXT_TAIL =
  ";window.__reactRouterContext.stream = new ReadableStream({start(controller){window.__reactRouterContext.streamController = controller;}}).pipeThrough(new TextEncoderStream());";
const ENQUEUE_HEAD = "window.__reactRouterContext.streamController.enqueue(";

// The module script: imports of the build's assets, the routes' table, the entry's import.
function isModuleScript(text: string): boolean {
  // A file of the build's assets, by its name alone: no slash, so no path leaves /assets/.
  const asset = /"\/assets\/[\w.-]+\.js"/.source;
  return new RegExp(
    String.raw`^(?:import ${asset};\n|import \* as route\d+(?:_\w+)? from ${asset};\n|const route\d+ = \{\.\.\.route\d+_\w+(?:,\.\.\.route\d+_\w+)*\};\n)+` +
      String.raw`\s*window\.__reactRouterRouteModules = \{"[\w/.$-]+":route\d+(?:,"[\w/.$-]+":route\d+)*\};\n\nimport\(${asset}\);$`,
  ).test(text);
}

function isJson(text: string, kind: "object" | "string"): boolean {
  try {
    const value: unknown = JSON.parse(text);
    return kind === "string" ? typeof value === "string" : typeof value === "object" && value !== null;
  } catch {
    return false;
  }
}

// The loader data: a JSON text in a string literal (JSON.parse takes no raw line break, no code joined to it), handed to the stream.
function isLoaderData(text: string): boolean {
  if (!text.startsWith(ENQUEUE_HEAD) || !text.endsWith(");")) return false;
  const literal = text.slice(ENQUEUE_HEAD.length, -2);
  return isJson(literal, "string");
}

// Which of React Router's forms a script's text is, as its place in the order a page holds them (scroll restoration, context,
// module script, loader data, close), or -1 when it is none of them.
function formOf(text: string): number {
  if (text === SCROLL_RESTORATION) return 0;
  if (text === STREAM_CLOSE) return 4;
  if (isModuleScript(text)) return 2;
  if (text.startsWith(CONTEXT_HEAD) && text.endsWith(CONTEXT_TAIL))
    return isJson(text.slice(CONTEXT_HEAD.length, -CONTEXT_TAIL.length), "object") ? 1 : -1;
  return isLoaderData(text) ? 3 : -1;
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

// The policy of each built page (a key is its file under build/client), holding its own scripts' hashes alone; the build stops
// on a page the policy would break in the browser, or on a script that is none of React Router's, rather than ship it.
export async function pagePolicies(pages: Readonly<Record<string, string>>): Promise<Record<string, string>> {
  const files = Object.keys(pages).sort();
  if (files.length === 0) throw new Error("csp: the build holds no page");
  const policies: Record<string, string> = {};
  for (const file of files) {
    const page = pages[file] ?? "";
    // A script's text is no markup.
    const markup = page.replace(scriptTags(), "");
    for (const [tag = ""] of markup.matchAll(new RegExp(`<[a-z]${attributesSource()}>`, "gi"))) {
      if (refused(tag)) throw new Error(`csp: a page holds ${tag.slice(0, 40)}, which the policy refuses`);
    }
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
    policies[file] = policy(await Promise.all(scripts.map(sha256)));
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
// answers it with that, so it names the scripts of both, and of nothing else.
function anywhere(policies: Readonly<Record<string, string>>): string {
  const documents = ["index.html", "__spa-fallback.html"];
  return policy(documents.flatMap((name) => policies[name]?.match(/'sha256-[A-Za-z0-9+/]{43}='/g) ?? []));
}

// The policies as `_headers` takes them (the catch-all `/*` first; every other rule detaches it, then sets its own), and as
// nginx's map of the answer's path: a page has its own, any other nginx answer the bare one. `workers` are the files that run
// as a worker (the service worker's script): a _headers host gives each the bare policy.
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
