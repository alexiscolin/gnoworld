// The server's process (ADR-0002 §7): settings, the database held alone, the HTTP server. On SIGTERM
// it stops being ready, lets what it serves finish, cuts what stalls, and exits by itself. Started as the image starts it:
// node --disallow-code-generation-from-strings server/src/main.ts
import { listen, makeApp, stop } from "./app.ts";
import { loadConfig } from "./config.ts";
import { openDatabase } from "@gnoworld/service/db";
import { logger } from "@gnoworld/service/log";
import { startChat } from "./chat.ts";
import { adminRoutes } from "./door/admin.ts";
import { askRoutes } from "./door/ask.ts";
import { jarvisClient } from "./door/jarvis.ts";
import { makeNames } from "./door/names.ts";
import { makeQuota } from "./door/quota.ts";
import { authServer, listenAt } from "./ergo/auth.ts";
import { makeLogin, makeSigned } from "./login/login.ts";
import { migrations } from "./migrations.ts";
import { pinsRoutes } from "./pins/routes.ts";
import { loginFrom } from "./login/routes.ts";
import { isTeam, loadRoles, spared } from "./roles/roles.ts";
import { startPrices } from "./prices/prices.ts";
import { defaultRpc } from "./prices/universes.ts";
import { startRetention } from "./retention/retention.ts";
import { roomsRoutes } from "./rooms/routes.ts";

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
// Jarvis's door (10g): a question from a room, held to its account's quota, to jarvis on the network only the two share;
// none without JARVIS_URL. Its quotas, allowlist and jarvis's budgets change on the admin API alone.
const door =
  config.jarvis === undefined
    ? undefined
    : {
        settings: config.jarvis,
        quota: makeQuota(db, { first: config.jarvis.first, now: Date.now }),
        jarvis: jarvisClient({ url: config.jarvis.url, timeoutMs: config.jarvis.timeoutMs }),
      };
if (door !== undefined)
  app.route(
    "/api/jarvis",
    askRoutes({
      session,
      origins: config.origins,
      mayRead: chat.mayRead,
      recent: chat.recent,
      named: makeNames({ rpc: door.settings.namesRpc, now: Date.now }),
      quota: door.quota,
      jarvis: door.jarvis,
      on: door.settings.on,
      questionChars: door.settings.questionChars,
      log,
      now: Date.now,
    }),
  );
// The admin API on a listener of its own, never the public one (ADR-0002 §6), with the login for its own site, so the
// console's session cookie is its alone; none without ADMIN_PORT. The network that walls it off is deploy's.
const adminApp = makeApp(log, () => !draining);
if (config.admin !== undefined) {
  adminApp.route("/api/login", loginFrom(db, { ...config, origins: config.admin.origins }, { log, console: true }));
  if (door !== undefined)
    adminApp.route(
      "/api/admin/jarvis",
      adminRoutes({
        isTeam: (who) => isTeam(roles, who),
        // The console's session, an hour from its signature, whatever login made it (ADR-0002 §6).
        session: makeLogin(db, { chains: config.chains, now: Date.now, console: true }).session,
        origins: config.admin.origins,
        signed: makeSigned(db, { chains: config.chains, now: Date.now, console: true }),
        quota: door.quota,
        jarvis: door.jarvis,
        log,
        now: Date.now,
      }),
    );
}
// Ergo's logins go through the socket; without it, Ergo lets nobody in (fails closed).
const auth = authServer(db, { log, ...(config.ergo === undefined ? {} : { bot: config.ergo.password }) });
if (config.authSocket !== undefined) await listenAt(auth, config.authSocket);
const server = await listen(app, config);
const admin = config.admin === undefined ? undefined : await listen(adminApp, config.admin);
// SIGTERM from the container's runtime, SIGINT from a terminal: one drain, however many arrive. Set
// before the server says it listens, so a signal sent on that line is drained, not fatal.
const drain = (): void => {
  if (draining) return;
  draining = true;
  log("stopping");
  retention.stop();
  prices?.stop();
  // The IRC link first. The database last, once the HTTP server and Ergo's socket have both let their
  // connections go: a line Ergo sent before the stop still meets an open database (the socket's deadline
  // bounds the wait).
  let open = admin === undefined ? 2 : 3;
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
    if (admin !== undefined) stop(admin, closed);
  };
  chat.stop().then(close, close);
};
process.on("SIGTERM", drain);
process.on("SIGINT", drain);
const address = server.address();
log("listening", { port: typeof address === "object" && address !== null ? address.port : config.port });
const adminAddress = admin?.address();
if (adminAddress !== undefined && typeof adminAddress === "object" && adminAddress !== null)
  log("admin_listening", { port: adminAddress.port });
