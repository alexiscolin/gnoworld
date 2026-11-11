// The server's process (ADR-0002 §7): settings, the database held alone, the HTTP server. On SIGTERM
// it stops being ready, lets what it serves finish, cuts what stalls, and exits by itself. Started as the image starts it:
// node --disallow-code-generation-from-strings server/src/main.ts
import { listen, makeApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { openDatabase } from "@gnoworld/service/db";
import { stop } from "@gnoworld/service/http";
import { logger } from "@gnoworld/service/log";
import { startChat } from "./chat.ts";
import { guestSettings } from "./guest/wire.ts";
import { adminRoutes } from "./door/admin.ts";
import { jarvisClient } from "./door/jarvis.ts";
import { doorMemory } from "./door/memory.ts";
import { mountDoor } from "./door/mount.ts";
import { makeQuota } from "./door/quota.ts";
import { authServer, listenAt } from "./ergo/auth.ts";
import { makeLogin, makeSigned } from "./login/login.ts";
import { migrations } from "./migrations.ts";
import { pinsRoutes } from "./pins/routes.ts";
import { loginFrom } from "./login/routes.ts";
import { historyRoutes } from "./prices/history.ts";
import { isTeam, loadRoles, spared } from "./roles/roles.ts";
import { startPrices } from "./prices/prices.ts";
import { checkFor, startPreviews } from "./previews/job.ts";
import { defaultUniverse, hubRealms, hubWorlds } from "./prices/universes.ts";
import { keptBy } from "./worlds/habitsFiles.ts";
import { startRetention } from "./retention/retention.ts";
import { roomsBoot } from "./rooms/roomsBoot.ts";
import { startWorlds } from "./worlds/job.ts";
import { trendsRoutes } from "./worlds/trends.ts";
import { dirname, join } from "node:path";
import { bootSignals } from "./signals/boot.ts";

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
        ...(config.universes === undefined ? {} : { universe: defaultUniverse(config.universes) }),
      });
// The worlds job (7c, every half hour, WORLDS_FILE) and the previews job (8f, every six hours, PREVIEWS_FILE, each page read by the
// moderation check) read the default universe alone: with no chain, or for previews no check, the server stops rather than run.
if ((config.worlds !== undefined || config.previews !== undefined) && config.universes === undefined)
  throw new Error("setting UNIVERSES_FILE: required");
if (config.previews !== undefined && config.moderation.openaiKey === undefined)
  throw new Error("setting OPENAI_API_KEY_FILE: required");
// The trends read a hub's rooms and its realms as one world (7t3): the hubs beside the universes, read before the job, so a bad file stops
// the server at boot; each world's chain windows kept beside the database, counts alone, none for a database in memory.
const hubs = config.worlds === undefined || config.universes === undefined ? undefined : hubWorlds(config.universes);
const worlds =
  config.worlds === undefined || config.universes === undefined
    ? undefined
    : startWorlds({
        file: config.worlds,
        log,
        universe: defaultUniverse(config.universes),
        ...keptBy(config.database, db, config.worlds),
      });
const { openaiKey, thresholds } = config.moderation;
const previews =
  config.previews === undefined || config.universes === undefined || openaiKey === undefined
    ? undefined
    : startPreviews({
        file: config.previews,
        log,
        universe: defaultUniverse(config.universes),
        pages: hubRealms(config.universes),
        check: checkFor({ openaiKey, thresholds }, { log }),
      });
let draining = false;
const app = makeApp(log, () => !draining);
app.route("/api/login", loginFrom(db, config, { log }));
// The login's sessions, read for the rooms' routes (3l) and the rooms a reader may see (3m).
const { session, signedAt } = makeLogin(db, { chains: config.chains, now: Date.now });
// The first signals (9h) and the chain in the rooms (9g), told on the one stream; the chain none without both data files.
const { stream, signals, chain } = bootSignals({ app, db, roles, config, log, session });
// What Jarvis's door asks of the chat (D13985): the accounts heard speak, and the answers kept until a line is taken.
const memory = doorMemory(db, config.origins, Date.now);
const chat = startChat(
  db,
  {
    worlds: roles.worlds,
    team: roles.team,
    ergo: config.ergo,
    moderation: config.moderation,
    trustedProxy: config.trustedProxy,
    spared: spared(roles),
    ...guestSettings(config, roles),
  },
  // Who is here keeps its history beside the database (7h); a database held in memory keeps none.
  {
    log,
    pepper: config.pepper,
    session,
    stream,
    signals,
    door: memory.chat,
    ...(config.database === ":memory:" ? {} : { presence: join(dirname(config.database), "presence.json") }),
  },
);
app.route("/api/activity", chat.activity);
// The guest chat (D430): a name and a cookie, then a line the bot says; both answer 404 under GUEST_CHAT=off.
if (chat.guest !== undefined) app.route("/api/guest", chat.guest);
if (chat.presence !== undefined) app.route("/api/presence", chat.presence);
// The markets row's sparklines (8i): the prices timer's day, a 404 while it has none or without the timer.
app.route("/api/markets/history", historyRoutes(prices?.history ?? (() => undefined)));
// The home's ticker's trends (7t): the worlds job's last passes and who is here, a few items; none without either, never a 404.
app.route(
  "/api/trends",
  trendsRoutes({
    chain: worlds?.trends ?? (() => ({ worlds: [], newest: [] })),
    presence: chat.presenceNow,
    chat: chat.presenceChat,
    hubs,
    now: Date.now,
  }),
);
app.route("/api/rooms", chat.roomList);
app.route("/api/stream", chat.stream);
app.route("/api/verdicts", chat.verdicts);
const roomsAhead = roomsBoot(app, config, { roles, rooms: chat.rooms, session, log, nameCheck: chat.nameCheck });
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
        jarvis: jarvisClient({ url: config.jarvis.url, timeoutMs: config.jarvis.timeoutMs, key: config.jarvis.key }),
      };
if (door !== undefined)
  mountDoor(app, { door, chat, memory: memory.ask, session, signedAt, origins: config.origins, log });
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
  for (const job of [retention, prices, worlds, previews, chain, roomsAhead]) job?.stop();
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
    for (const listener of [server, admin]) if (listener !== undefined) stop(listener, closed);
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
