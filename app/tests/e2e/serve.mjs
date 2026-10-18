// The built site as a static host serves it (ADR-0002 §2): the file for a path where one exists,
// spelled exactly, otherwise the SPA fallback with a 404, never a page that is not the place asked for.
import { createReadStream, realpathSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../build/client/", import.meta.url));
// The types of what the build writes (`.data`: React Router's single-fetch.js). Any other kind of
// file answers 500, so the journeys fail on it rather than pass on a type no real host would give.
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".data": "text/x-script" };

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
  const type = TYPES[extname(served)];
  if (!type) {
    response.writeHead(500).end();
    return;
  }
  response.writeHead(found ? 200 : 404, { "content-type": type });
  createReadStream(served)
    .on("error", () => response.destroy())
    .pipe(response);
}).listen(4173, "127.0.0.1");
