// The built site as a static host serves it (ADR-0002 §2): the file for a path where one exists, spelled
// exactly, else the SPA fallback with a 404. On E2E_PORT's base (sites.ts) and the next two ports: the second
// serves the same build for the PWA's update journey (a POST to /__bump makes its sw.js a new version, as a
// deploy would; /__tamper turns a changed route file on and off; /__down answers 503 for sw.js, as an update
// check offline finds no host; /__deploy turns a release on and off, below); the third does the same behind
// the demo's shared password.
import { createHash } from "node:crypto";
import { createReadStream, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../build/client/", import.meta.url));
// The policy the build wrote for every answer (src/csp.ts), as a host that reads _headers sends it.
const POLICY = /^  Content-Security-Policy: (.+)$/m.exec(readFileSync(join(root, "_headers"), "utf8"))?.[1];
if (POLICY === undefined) throw new Error("serve.mjs: the build's _headers names no Content-Security-Policy");
// The types of what the build writes (`.data`: React Router's single-fetch.js). Any other kind of
// file answers 500, so the journeys fail on it rather than pass on a type no real host would give.
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".data": "text/x-script",
  ".webmanifest": "application/manifest+json",
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

let releasedPolicy;
function policyOfRelease() {
  releasedPolicy ??= (() => {
    const hashes = new Set();
    for (const name of FILES.filter((each) => each.endsWith(".html")))
      for (const [, attributes, text] of released(join(root, name))
        .toString("utf8")
        .matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))
        if (!/\ssrc\s*=/i.test(attributes)) hashes.add(`'sha256-${digest(text, "sha256")}'`);
    return POLICY.replace(/ 'sha256-[^']+'/g, "").replace(
      "script-src 'self'",
      `script-src 'self' ${[...hashes].join(" ")}`,
    );
  })();
  return releasedPolicy;
}

// The test's own password, never the demo's.
const PASSWORD = `Basic ${Buffer.from("team:a test password").toString("base64")}`;

function host({ bumping = false, password = false }) {
  let bumps = 0;
  let tampered = false;
  let down = false;
  let deployed = false;
  return (request, response) => {
    response.setHeader("content-security-policy", deployed ? policyOfRelease() : POLICY);
    if (password && request.headers.authorization !== PASSWORD) {
      response.writeHead(401, { "www-authenticate": 'Basic realm="gno.world demo"' }).end();
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url ?? "/", "http://host").pathname);
    } catch {
      response.writeHead(400).end();
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

const port = Number(process.env.E2E_PORT ?? 4173);
if (!Number.isInteger(port) || port < 1024 || port > 65533)
  throw new Error(`serve.mjs: E2E_PORT is no port base: ${process.env.E2E_PORT}`);
createServer(host({})).listen(port, "127.0.0.1");
createServer(host({ bumping: true })).listen(port + 1, "127.0.0.1");
createServer(host({ bumping: true, password: true })).listen(port + 2, "127.0.0.1");
