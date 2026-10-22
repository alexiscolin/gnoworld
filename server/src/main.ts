// The server's process (ADR-0002 §7): settings, the database held alone, the HTTP server. On SIGTERM
// it stops being ready, lets what it serves finish, cuts what stalls, and exits by itself. Started as the image starts it:
// node --disallow-code-generation-from-strings server/src/main.ts
import { listen, makeApp, stop } from "./app.ts";
import { loadConfig } from "./config.ts";
import { openDatabase } from "./db.ts";
import { logger } from "./log.ts";
import { loadRoles } from "./roles/roles.ts";

const FLAG = "--disallow-code-generation-from-strings";
if (!process.execArgv.includes(FLAG)) throw new Error(`start the server with ${FLAG} (ADR-0002 §7)`);

const config = loadConfig(process.env);
// Checked at boot, so a bad roles file never starts a server; the bot's link (3h) reads it.
loadRoles(config.roles);
const log = logger(config.pepper, (line) => process.stdout.write(line));
const db = openDatabase(config.database, []);
let draining = false;
const server = await listen(
  makeApp(log, () => !draining),
  config,
);
const address = server.address();
log("listening", { port: typeof address === "object" && address !== null ? address.port : config.port });

// SIGTERM from the container's runtime, SIGINT from a terminal: one drain, however many arrive.
const drain = (): void => {
  if (draining) return;
  draining = true;
  log("stopping");
  stop(server, () => {
    db.close();
  });
};
process.on("SIGTERM", drain);
process.on("SIGINT", drain);
