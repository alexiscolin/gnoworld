// The built site as a static host serves it (ADR-0002 §2): the file for a path where one exists,
// spelled exactly, otherwise the SPA fallback with a 404, never a page that is not the place asked for.
import { createReadStream, realpathSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../build/client/", import.meta.url));
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
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
  createReadStream(served)
    .on("error", () => response.destroy())
    .pipe(response);
}).listen(4173, "127.0.0.1");
