// What the workshop's dev server serves besides the app (vite.config.ts's workshopData): the files the backend's worlds job and prices timer
// write into the folder scripts/workshop.sh made (WORKSHOP_DATA_DIR), which nginx serves in production. Exactly these names, each read from
// that folder: no path is built from the request, nothing else of the folder is reachable and it is never listed.
import { readFile } from "node:fs";
import { join } from "node:path";

const FILES = ["worlds.json", "worlds-count.json", "markets.json"];

// The middleware: a GET or HEAD of exactly `/<name>` (no query, no encoding, no suffix) is answered from `dir`; any other request goes on.
export const workshopDataFiles = (dir) => (req, res, next) => {
  const name = FILES.find((file) => req.url === `/${file}`);
  if (name === undefined || (req.method !== "GET" && req.method !== "HEAD")) {
    next();
    return;
  }
  readFile(join(dir, name), (error, body) => {
    res.setHeader("cache-control", "no-store");
    if (error) {
      // Not written yet (the job's first pass reads the chain): a 404, as nginx's before the first write.
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader("content-type", "application/json");
    res.end(req.method === "HEAD" ? undefined : body);
  });
};
