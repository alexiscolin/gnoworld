// The server's process (ADR-0002 §7): settings, the database held alone, the HTTP server. On SIGTERM
// it stops being ready, lets what it serves finish, cuts what stalls, and exits by itself. Started as the image starts it:
// node --disallow-code-generation-from-strings server/src/main.ts
import { listen, makeApp, stop } from "./app.ts";
import { loadConfig } from "./config.ts";
import { openDatabase } from "./db.ts";
import { logger } from "./log.ts";
import { startChat } from "./chat.ts";
import { authServer, listenAt } from "./ergo/auth.ts";
import { makeLogin } from "./login/login.ts";
import { migrations } from "./migrations.ts";
import { pinsRoutes } from "./pins/routes.ts";
import { loginFrom } from "./login/routes.ts";
import { loadRoles, spared } from "./roles/roles.ts";
import { startPrices } from "./prices/prices.ts";
import { defaultRpc, defaultUniverse } from "./prices/universes.ts";
import { startRetention } from "./retention/retention.ts";
import { roomsRoutes } from "./rooms/routes.ts";
import { startWorlds } from "./worlds/job.ts";

const FLAG = "--disallow-code-generation-from-strings";
if (!process.execArgv.includes(FLAG)) throw new Error(`start the server with ${FLAG} (ADR-0002 §7)`);

const config = loadConfig(process.env);
// Checked at boot, so a bad roles file never starts a server; the bot's link (3h) reads it.
const roles = loadRoles(config.roles);
const log = logger(config.pepper, (line) => process.stdout.write(line));
const db = openDatabase(config.database, migrations);
// The verdicts kept 180 days and below their cap, now and every five minutes (3n), Ergo's folder measured (3n-b).
const retention = startRetention(db, { log, ergoData: config.ergoData });
// CoinGecko's prices every five minutes into the file MARKETS_FILE names (5l); without it, no timer. With UNIVERSES_FILE the
// same read takes the default universe's block height from its RPC, so a visitor's browser asks no chain.
const prices =
  config.markets === undefined
    ? undefined
    : startPrices({
        file: config.markets,
        log,
        ...(config.universes === undefined ? {} : { rpc: defaultRpc(config.universes) }),
      });
// The default universe's realms grouped into worlds every half hour into the file WORLDS_FILE names (7c); without it, no job.
// Only the default universe: the way out lets out its RPC and no other's.
// A job meant that could not know which chain to read: the server stops rather than run without it.
if (config.worlds !== undefined && config.universes === undefined) throw new Error("setting UNIVERSES_FILE: required");
const worlds =
  config.worlds === undefined || config.universes === undefined
    ? undefined
    : startWorlds({ file: config.worlds, log, universe: defaultUniverse(config.universes) });
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
app.route("/api/rooms", chat.roomList);
app.route("/api/stream", chat.stream);
app.route("/api/verdicts", chat.verdicts);
app.route(
  "/api/rooms",
  roomsRoutes({ roles, rooms: chat.rooms, session, origins: config.origins, log, now: Date.now }),
);
app.route(
  "/api/pins",
  pinsRoutes({
    pins: chat.pins,
    mayPin: chat.mayPin,
    readable: chat.mayRead,
    session,
    origins: config.origins,
    log,
    now: Date.now,
  }),
);
// Ergo's logins go through the socket; without it, Ergo lets nobody in (fails closed).
const auth = authServer(db, { log, ...(config.ergo === undefined ? {} : { bot: config.ergo.password }) });
if (config.authSocket !== undefined) await listenAt(auth, config.authSocket);
const server = await listen(app, config);
// SIGTERM from the container's runtime, SIGINT from a terminal: one drain, however many arrive. Set
// before the server says it listens, so a signal sent on that line is drained, not fatal.
const drain = (): void => {
  if (draining) return;
  draining = true;
  log("stopping");
  retention.stop();
  prices?.stop();
  worlds?.stop();
  // The IRC link first. The database last, once the HTTP server and Ergo's socket have both let their
  // connections go: a line Ergo sent before the stop still meets an open database (the socket's deadline
  // bounds the wait).
  let open = 2;
  const closed = (): void => {
    open -= 1;
    if (open === 0) {
      db.close();
      // A call out still open (a price read on a stalled proxy) would hold the exit past the container's grace
      // period: everything is closed by now, so the process leaves within 200 ms whatever is left.
      setTimeout(() => process.exit(0), 200).unref();
    }
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
