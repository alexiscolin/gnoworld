// The server's process (ADR-0002 §7): settings, the database held alone, the HTTP server. On SIGTERM
// it stops being ready, lets what it serves finish, cuts what stalls, and exits by itself. Started as the image starts it:
// node --disallow-code-generation-from-strings server/src/main.ts
import { listen, makeApp, stop } from "./app.ts";
import { loadConfig } from "./config.ts";
import { openDatabase } from "./db.ts";
import { logger } from "./log.ts";
import { startChat } from "./chat.ts";
import { authServer, listenAt } from "./ergo/auth.ts";
import { LOGIN_TABLES, makeLogin, NONCE_HOST } from "./login/login.ts";
import { TICKET_TABLES } from "./login/ticket.ts";
import { PROGRESS_TABLES } from "./moderation/catchup.ts";
import { MUTE_TABLES } from "./moderation/mute.ts";
import { STRIKE_TABLES } from "./moderation/strikes.ts";
import { VERDICT_TABLES } from "./moderation/check.ts";
import { ROOM_TABLES } from "./rooms/rooms.ts";
import { loginFrom } from "./login/routes.ts";
import { loadRoles, spared } from "./roles/roles.ts";
import { ROOM_STATE } from "./rooms/create.ts";
import { roomsRoutes } from "./rooms/routes.ts";

const FLAG = "--disallow-code-generation-from-strings";
if (!process.execArgv.includes(FLAG)) throw new Error(`start the server with ${FLAG} (ADR-0002 §7)`);

const config = loadConfig(process.env);
// Checked at boot, so a bad roles file never starts a server; the bot's link (3h) reads it.
const roles = loadRoles(config.roles);
const log = logger(config.pepper, (line) => process.stdout.write(line));
const db = openDatabase(config.database, [
  LOGIN_TABLES,
  TICKET_TABLES,
  NONCE_HOST,
  ROOM_TABLES,
  VERDICT_TABLES,
  PROGRESS_TABLES,
  MUTE_TABLES,
  STRIKE_TABLES,
  ROOM_STATE,
]);
let draining = false;
const app = makeApp(log, () => !draining);
app.route("/api/login", loginFrom(db, config, { log }));
// The login's sessions, read for the rooms' routes (3l) and the rooms a reader may see (3m).
const { session } = makeLogin(db, { chains: config.chains, now: Date.now });
const chat = startChat(
  db,
  {
    worlds: roles.worlds,
    team: roles.team,
    ergo: config.ergo,
    moderation: config.moderation,
    trustedProxy: config.trustedProxy,
    spared: spared(roles),
  },
  { log, pepper: config.pepper, session },
);
app.route("/api/activity", chat.activity);
app.route("/api/stream", chat.stream);
app.route(
  "/api/rooms",
  roomsRoutes({ roles, rooms: chat.rooms, session, origins: config.origins, log, now: Date.now }),
);
// Ergo's logins go through the socket; without it, Ergo lets nobody in (fails closed).
const auth = authServer(db, { log });
if (config.authSocket !== undefined) await listenAt(auth, config.authSocket);
const server = await listen(app, config);
// SIGTERM from the container's runtime, SIGINT from a terminal: one drain, however many arrive. Set
// before the server says it listens, so a signal sent on that line is drained, not fatal.
const drain = (): void => {
  if (draining) return;
  draining = true;
  log("stopping");
  // The IRC link first. The database last, once the HTTP server and Ergo's socket have both let their
  // connections go: a line Ergo sent before the stop still meets an open database (the socket's deadline
  // bounds the wait).
  let open = 2;
  const closed = (): void => {
    open -= 1;
    if (open === 0) db.close();
  };
  auth.close(closed);
  const close = (): void => {
    stop(server, closed);
  };
  chat.stop().then(close, close);
};
process.on("SIGTERM", drain);
process.on("SIGINT", drain);
const address = server.address();
log("listening", { port: typeof address === "object" && address !== null ? address.port : config.port });
