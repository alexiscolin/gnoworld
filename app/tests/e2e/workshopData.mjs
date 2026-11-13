// What the workshop's dev server serves besides the app (vite.config.ts's workshopData): the files the backend's worlds job and prices timer
// write into the folder scripts/workshop.sh made (WORKSHOP_DATA_DIR), which nginx serves in production. Exactly these names, each read from
// that folder (a rollup's name is a fixed 32-hex pattern, nothing else of the request is in the path): no path is built from the request, nothing else of the folder is reachable and it is never listed.
import { readFile } from "node:fs";
import { join } from "node:path";

const FILES = ["worlds.json", "worlds-count.json", "markets.json"];
// Each realm's rollup (13a), as nginx serves it: that one name, under /rollups/, from the folder of the same name beside the worlds' file.
const ROLLUP = /^\/rollups\/([0-9a-f]{32}\.json)$/;

// The middleware: a GET or HEAD of exactly `/<name>` (no query, no encoding, no suffix) is answered from `dir`; any other request goes on.
export const workshopDataFiles = (dir) => (req, res, next) => {
  const url = req.url ?? "";
  const rolled = ROLLUP.exec(url)?.[1];
  const name = rolled === undefined ? FILES.find((file) => url === `/${file}`) : join("rollups", rolled);
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
