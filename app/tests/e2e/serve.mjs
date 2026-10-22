// The built site as a static host serves it (ADR-0002 §2): the file for a path where one exists,
// spelled exactly, otherwise the SPA fallback with a 404, never a page that is not the place asked for.
// Port 4174 serves the same build for the PWA's update journey: a POST to /__bump makes its sw.js
// a new version, as a deploy would; one to /__tamper turns on and off a changed route file, one to
// /__down a host that answers 503 for sw.js, as an update check offline finds no host. Port
// 4175 does the same behind the demo's shared password, as the demo's host asks for one.
import { createReadStream, readFileSync, realpathSync, statSync } from "node:fs";
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

// The test's own password, never the demo's.
const PASSWORD = `Basic ${Buffer.from("team:a test password").toString("base64")}`;

function host({ bumping = false, password = false }) {
  let bumps = 0;
  let tampered = false;
  let down = false;
  return (request, response) => {
    response.setHeader("content-security-policy", POLICY);
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

createServer(host({})).listen(4173, "127.0.0.1");
createServer(host({ bumping: true })).listen(4174, "127.0.0.1");
createServer(host({ bumping: true, password: true })).listen(4175, "127.0.0.1");
