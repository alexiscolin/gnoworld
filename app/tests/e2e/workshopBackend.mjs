// The workshop's backend (scripts/workshop.sh; Alexis, 2026-11-04: "avec le chat dedans et toute l'UI"): the journeys' real server and real
// Ergo (api.mjs), on the ports the workshop gave its app's dev server to proxy (vite.config.ts's workshopBackend), allowing the origins it
// serves the app from. It lives until a signal, which stops both and removes their folders (startBackend).
// Usage: node workshopBackend.mjs <the server's port> <Ergo's port> <Ergo's WebSocket port> <origin>...
import { fileURLToPath } from "node:url";
import { startBackend } from "./api.mjs";

const [api = "", irc = "", ws = "", ...origins] = process.argv.slice(2);
const port = (text) => {
  if (!/^\d{1,5}$/.test(text) || Number(text) < 1 || Number(text) > 65535)
    throw new Error(`workshopBackend.mjs: no port: "${text}"`);
  return Number(text);
};
if (origins.length === 0) throw new Error("workshopBackend.mjs: give the origins the app is served from");
// The worlds job and the prices timer run here alone, into the folder the workshop made (WORKSHOP_DATA_DIR), where its dev server reads
// the files (workshopData.mjs); the chain they read is the data's default universe (app/data/universes.json).
const dir = process.env.WORKSHOP_DATA_DIR;
if (dir === undefined || !dir.startsWith("/"))
  throw new Error("workshopBackend.mjs: WORKSHOP_DATA_DIR must be an absolute path");
const universes = fileURLToPath(new URL("../../data/universes.json", import.meta.url));
const ready = await startBackend(origins, {
  apiPort: port(api),
  ergoPorts: [port(irc), port(ws)],
  jobs: { dir, universes },
});
console.log(
  `workshopBackend.mjs: the server on 127.0.0.1:${String(ready.api)}, Ergo's WebSocket on 127.0.0.1:${String(ready.ws)}`,
);
