// The built site as a static host serves it (ADR-0002 §2): the file for a path where one exists,
// otherwise the SPA fallback with a 404, never a page that is not the place asked for.
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../build/client/", import.meta.url));
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function find(pathname) {
  const path = normalize(join(root, pathname));
  if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) return undefined;
  return [path, join(path, "index.html")].find(isFile);
}

createServer((request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? "/", "http://host").pathname);
  } catch {
    response.writeHead(400).end();
    return;
  }
  const found = find(pathname);
  const served = found ?? join(root, "__spa-fallback.html");
  response.writeHead(found ? 200 : 404, { "content-type": TYPES[extname(served)] ?? "application/octet-stream" });
  createReadStream(served).pipe(response);
}).listen(4173, "127.0.0.1");
