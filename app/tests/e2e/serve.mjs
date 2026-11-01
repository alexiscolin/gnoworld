// The built site as a static host serves it (ADR-0002 §2): the file for a path where one exists, spelled exactly,
// else the SPA fallback with a 404. On E2E_PORT's base (sites.ts) and the next two ports: the second serves the same
// build for the PWA's update journey (POST /__bump makes its sw.js a new version; /__tamper turns a changed route file
// on and off; /__down answers 503 for sw.js; /__deploy turns a release on and off, below), the third the same behind
// the demo's password. /api goes to the real server, /ws to a real Ergo, /__drop?tag= ends the tagged pages'
// WebSockets, /__wallet and /__sign answer for Adena's stand-in (api.mjs).
import { createHash } from "node:crypto";
import { createReadStream, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inlineScripts, policy, sha256 } from "../../src/csp.ts";
import { originsOf } from "../../src/cspOrigins.ts";
import { dropSockets, relay, relayUpgrade, startBackend, walletAnswer } from "./api.mjs";
import { headerRules } from "./cspFiles.mjs";

const root = fileURLToPath(new URL("../../build/client/", import.meta.url));
// The policy of each page the build wrote (src/csp.ts), by its address, as a host that reads _headers sends it. Every other
// answer (a file, a 400, a 401, a 500) gets the one with no hash, as nginx's map sends its default.
const RULES = headerRules(readFileSync(join(root, "_headers"), "utf8"));
// The catch-all rule (`/*`) every path no page names falls to.
const ANY = RULES.get("/*");
if (ANY === undefined) throw new Error("serve.mjs: the build's _headers names no catch-all Content-Security-Policy");
const BARE = policy([]);
// The types of what the build writes (`.data`: React Router's single-fetch.js). Any other kind of
// file answers 500, so the journeys fail on it rather than pass on a type no real host would give.
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".data": "text/x-script",
  ".webmanifest": "application/manifest+json",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
};

// A file as the path spells it: macOS finds one in another case, where a Linux host would not.
function isFile(path) {
  try {
    return statSync(path).isFile() && realpathSync.native(path) === path;
  } catch {
    return false;
  }
}

function find(pathname) {
  const path = join(root, pathname);
  return path.startsWith(root) ? [path, join(path, "index.html")].find(isFile) : undefined;
}

// The decoded path of a request, or none when its URL is malformed.
function pathOf(request) {
  try {
    return decodeURIComponent(new URL(request.url ?? "/", "http://host").pathname);
  } catch {
    return undefined;
  }
}

// A release (POST /__deploy), as a deploy of the next build would be: every hashed file under a new name and
// new bytes (the names it holds are renamed), the old names gone from the host, the worker's list and the
// pages' inline-script hashes written again from those bytes.
const FILES = readdirSync(root, { recursive: true })
  .map(String)
  .filter((name) => isFile(join(root, name)));
const ASSETS = FILES.filter((name) => /^assets\/.+-[\w-]{8}\.(?:js|css|woff2)$/.test(name)).map((name) =>
  name.slice(7),
);
const OLD = new Set(ASSETS);
const renamed = (name) =>
  name.replace(/-([\w-])([\w-]{7})(\.\w+)$/, (_, first, rest, ext) => `-${first === "Z" ? "Y" : "Z"}${rest}${ext}`);
const BY_NEW = new Map(ASSETS.map((name) => [renamed(name), name]));
const NAMES = new RegExp(ASSETS.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
const digest = (bytes, algorithm) => createHash(algorithm).update(bytes).digest("base64");

function released(file) {
  const bytes = readFileSync(file);
  return [".html", ".js", ".css"].includes(extname(file))
    ? Buffer.from(bytes.toString("utf8").replace(NAMES, renamed))
    : bytes;
}

let releasedWorker;
function workerOfRelease() {
  releasedWorker ??= (() => {
    const swap = new Map(
      FILES.map((name) => [
        `sha384-${digest(readFileSync(join(root, name)), "sha384")}`,
        `sha384-${digest(released(join(root, name)), "sha384")}`,
      ]),
    );
    return released(join(root, "sw.js"))
      .toString("utf8")
      .replace(/sha384-[A-Za-z0-9+/]{64}/g, (held) => swap.get(held) ?? held);
  })();
  return Buffer.from(releasedWorker);
}

// A page of the release: its own scripts' hashes, from the bytes it is sent with (a data block has none).
// The build's own reading of the page (csp.ts), so the journeys hold a release to the rule the build holds, the RPC origins
// the build named included (the home reads a block height).
async function policyOfRelease(file) {
  return policy(await Promise.all(inlineScripts(released(file).toString("utf8")).map(sha256)), originsOf(ANY));
}

// The policy of an answer: a page's, as a host that reads _headers picks it, by the request path (the rule that names it, else
// the catch-all `/*`, whatever file is served there: F2451); a release's from the bytes it is sent with; any other file the
// bare one, as nginx's map sends its default.
async function policyOf(file, pathname, deployed) {
  if (!file.endsWith(".html")) return BARE;
  if (deployed) return policyOfRelease(file);
  return RULES.get(pathname) ?? ANY;
}

// The test's own password, never the demo's.
const PASSWORD = `Basic ${Buffer.from("team:a test password").toString("base64")}`;

function host({ bumping = false, password = false }) {
  let bumps = 0;
  let tampered = false;
  let down = false;
  let deployed = false;
  return async (request, response) => {
    response.setHeader("content-security-policy", BARE);
    if (password && request.headers.authorization !== PASSWORD) {
      response.writeHead(401, { "www-authenticate": 'Basic realm="gno.world demo"' }).end();
      return;
    }
    let pathname = pathOf(request);
    if (pathname === undefined) {
      response.writeHead(400).end();
      return;
    }
    if (pathname.startsWith("/api/")) {
      relay(backend.api, request, response);
      return;
    }
    // A request to /ws that is no upgrade goes to Ergo too, which refuses it, as nginx's exact /ws location does.
    if (pathname === "/ws") {
      relay(backend.ws, request, response);
      return;
    }
    // A network gone for every page's chat at once (4b's reconnect journey).
    if (request.method === "POST" && pathname === "/__drop") {
      dropSockets(new URL(request.url ?? "/", "http://host").searchParams.get("tag") ?? "");
      response.writeHead(204).end();
      return;
    }
    if (pathname === "/__wallet" || (pathname === "/__sign" && request.method === "POST")) {
      walletAnswer(request, response, pathname);
      return;
    }
    if (bumping && request.method === "POST" && pathname === "/__bump") {
      bumps += 1;
      response.writeHead(204).end();
      return;
    }
    if (bumping && request.method === "POST" && pathname === "/__tamper") {
      tampered = !tampered;
      response.writeHead(204).end();
      return;
    }
    if (bumping && request.method === "POST" && pathname === "/__down") {
      down = !down;
      response.writeHead(204).end();
      return;
    }
    if (bumping && request.method === "POST" && pathname === "/__deploy") {
      deployed = !deployed;
      response.writeHead(204).end();
      return;
    }
    if (deployed && pathname.startsWith("/assets/")) {
      const name = pathname.slice(8);
      if (BY_NEW.has(name)) pathname = `/assets/${BY_NEW.get(name)}`;
      else if (OLD.has(name)) pathname = "/assets/dropped";
    }
    if (down && pathname === "/sw.js") {
      response.writeHead(503).end();
      return;
    }
    const found = find(pathname);
    const served = found ?? join(root, "__spa-fallback.html");
    const type = TYPES[extname(served)];
    if (!type) {
      response.writeHead(500).end();
      return;
    }
    response.setHeader("content-security-policy", await policyOf(served, pathname, deployed));
    response.writeHead(found ? 200 : 404, { "content-type": type });
    if (deployed) {
      const body = pathname === "/sw.js" ? workerOfRelease() : released(served);
      response.end(
        bumps > 0 && pathname === "/sw.js" ? Buffer.concat([body, Buffer.from(`\n// bumped ${bumps}\n`)]) : body,
      );
      return;
    }
    if (bumps > 0 && pathname === "/sw.js") {
      response.end(`${readFileSync(served, "utf8")}\n// bumped ${String(bumps)}\n`);
      return;
    }
    if (tampered && pathname.startsWith("/assets/notFound-main-")) {
      response.end(`${readFileSync(served, "utf8")}\n// tampered\n`);
      return;
    }
    createReadStream(served)
      .on("error", () => response.destroy())
      .pipe(response);
  };
}

// An upgrade to /ws goes to Ergo's listener; any other upgrade finds nothing, as on a static host.
function upgrade(request, socket, head) {
  if (pathOf(request) === "/ws") relayUpgrade(backend.ws, request, socket, head);
  else socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
}

const port = Number(process.env.E2E_PORT ?? 4173);
if (!Number.isInteger(port) || port < 1024 || port > 65533)
  throw new Error(`serve.mjs: E2E_PORT is no port base: ${process.env.E2E_PORT}`);
// Ergo and the server first: a journey starts once the site answers, and the site's /api and /ws must answer by then.
const origins = [port, port + 1, port + 2].map((each) => `http://127.0.0.1:${String(each)}`);
const backend = await startBackend(origins);
createServer(host({})).on("upgrade", upgrade).listen(port, "127.0.0.1");
createServer(host({ bumping: true }))
  .on("upgrade", upgrade)
  .listen(port + 1, "127.0.0.1");
createServer(host({ bumping: true, password: true }))
  .on("upgrade", upgrade)
  .listen(port + 2, "127.0.0.1");
