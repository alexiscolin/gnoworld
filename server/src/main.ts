// The server's process (ADR-0002 §7): settings, the database held alone, the HTTP server. On SIGTERM
// it stops being ready, lets what it serves finish, cuts what stalls, and exits by itself. Started as the image starts it:
// node --disallow-code-generation-from-strings server/src/main.ts
import { listen, makeApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { openDatabase } from "@gnoworld/service/db";
import { stop } from "@gnoworld/service/http";
import { logger } from "@gnoworld/service/log";
import { startChat } from "./chat.ts";
import { cardsBoot } from "./cards/wire.ts";
import { translationsBoot } from "./translations/wire.ts";
import { guestSettings } from "./guest/wire.ts";
import { adminBoot } from "./adminBoot.ts";
import { jarvisClient } from "./door/jarvis.ts";
import { doorMemory } from "./door/memory.ts";
import { mountDoor } from "./door/mount.ts";
import { stateRoutes } from "./door/state.ts";
import { makeQuota } from "./door/quota.ts";
import { authServer, listenAt } from "./ergo/auth.ts";
import { makeLogin } from "./login/login.ts";
import { explainBoot } from "./explain/wire.ts";
import { migrations } from "./migrations.ts";
import { loginFrom } from "./login/routes.ts";
import { historyRoutes } from "./prices/history.ts";
import { loadRoles, spared } from "./roles/roles.ts";
import { mountOwners } from "./roles/wire.ts";
import { defaultUniverse } from "./prices/universes.ts";
import { startRetention } from "./retention/retention.ts";
import { makeSearch } from "./search/index.ts";
import { searchRoutes } from "./search/routes.ts";
import { unreadBoot } from "./unread/boot.ts";
import { callRoutes } from "./calls/routes.ts";
import { listRooms, worldOf } from "./rooms/rooms.ts";
import { roomsBoot } from "./rooms/roomsBoot.ts";
import { networkRoutes } from "./worlds/network.ts";
import { peopleRoutes, worldsFile } from "./worlds/person.ts";
import { trendingRoutes } from "./worlds/trending.ts";
import { tokenRoutes } from "./worlds/tokenRoutes.ts";
import { tokenStore } from "./worlds/tokenStore.ts";
import { trendsRoutes } from "./worlds/trends.ts";
import { dirname, join } from "node:path";
import { bootSignals } from "./signals/boot.ts";
import { bootJobs } from "./jobs/boot.ts";

const FLAG = "--disallow-code-generation-from-strings";
if (!process.execArgv.includes(FLAG)) throw new Error(`start the server with ${FLAG} (ADR-0002 §7)`);

const config = loadConfig(process.env);
// Checked at boot, so a bad roles file never starts a server; the bot's link (3h) reads it.
const roles = loadRoles(config.roles);
const log = logger(config.pepper, (line) => process.stdout.write(line));
const db = openDatabase(config.database, migrations);
// The verdicts kept 180 days and below their cap, now and every five minutes (3n), Ergo's folder measured (3n-b).
// The search index (slice 13): the retention expires its lines, the chat feeds it.
const search = makeSearch(db, { roles, now: Date.now });
// The link cards (slice 13): the chat makes the flow, and the retention reads it once it exists; a card is checked by OpenAI or not shown.
const cards = cardsBoot(config);
// What Jarvis's door asks of the chat (D13985): the accounts heard speak, and the answers kept until a line is taken.
const chainId = (): string | undefined =>
  config.universes === undefined ? undefined : defaultUniverse(config.universes).chainId;
const translations = translationsBoot();
const memory = doorMemory(db, config.origins, { now: Date.now, chainId });
const retention = startRetention(db, {
  log,
  ergoData: config.ergoData,
  search,
  cards,
  kept: memory.ask.kept,
  translations,
  said: memory.said,
});
const { prices, worlds, previews, hubs, trending, network, balance } = bootJobs({ config, db, log });
let draining = false;
const app = makeApp(log, () => !draining);
app.route("/api/login", loginFrom(db, config, { log }));
// The login's sessions, read for the rooms' routes (3l) and the rooms a reader may see (3m).
const { session, signedAt } = makeLogin(db, { chains: config.chains, now: Date.now });
// The first signals (9h) and the chain in the rooms (9g), told on the one stream; the chain none without both data files.
const { stream, signals, chain } = bootSignals({ app, db, roles, config, log, session });
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
    search,
    ...cards.options,
    translate: door?.settings.on === true ? door.jarvis.translate : undefined,
    door: memory.chat,
    ...(config.database === ":memory:" ? {} : { presence: join(dirname(config.database), "presence.json") }),
  },
);
cards.attach(chat.cards);
memory.said.attach(chat.said);
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
// The chat's /trending card: the last 7 days' most called worlds, the last pass's, a 404 while it has none.
app.route("/api/trending", trendingRoutes(trending));
// A person's card: their calls and system from the rollup, their balance from the node; none without the worlds job's chain.
if (balance !== undefined)
  app.route(
    "/api/people",
    peopleRoutes({ db, worlds: worldsFile(config.worlds), balance, proxy: config.trustedProxy, log, now: Date.now }),
  );
// A token realm's holders and supply, replayed by the worlds job from grc20's events; a 404 for a realm with none, always one without the chain.
const tokens = config.universes === undefined ? undefined : tokenStore(db, defaultUniverse(config.universes).id);
app.route(
  "/api/tokens",
  tokenRoutes({ answer: (hash) => tokens?.answerOf(hash), proxy: config.trustedProxy, now: Date.now }),
);
// The home's one line of network health, the last pass's, a 404 while it has none.
app.route("/api/network", networkRoutes(network));
app.route("/api/rooms", chat.roomList);
app.route("/api/stream", chat.stream);
app.route("/api/verdicts", chat.verdicts);
translations.attach(chat, app, { session, config, log });
// Search (slice 13, B2): the lines of one world's rooms a reader may open, the right asked again on every page.
app.route(
  "/api/search",
  searchRoutes({
    search,
    roles,
    archived: chat.rooms.archived,
    rooms: (world) => listRooms(db).flatMap(({ name }) => (worldOf(name) === world ? [name] : [])),
    session,
    origins: config.origins,
    proxy: config.trustedProxy,
    log,
    now: Date.now,
  }),
);
// Each world's unread count (slice 13): the places a page forwards, counted against the search index's lines.
unreadBoot(app, { db, roles, archived: chat.rooms.archived, session, origins: config.origins, log, now: Date.now });
// A call's detail, read from the default universe's indexer and kept by hash; none without the universes' file.
if (config.universes !== undefined)
  app.route(
    "/api/calls",
    callRoutes({
      indexer: defaultUniverse(config.universes).indexer,
      origins: config.origins,
      proxy: config.trustedProxy,
      log,
      now: Date.now,
    }),
  );
const roomsAhead = roomsBoot(app, config, { roles, rooms: chat.rooms, session, log, nameCheck: chat.nameCheck });
// The owner's right and the links (owners' moderation, part 4): the pins ask the right, /api/links lists and makes the links.
mountOwners(app, { db, config, hubs, chat, spared: spared(roles), session, signedAt, log });
// Whether it is on, told to any page; off with no door at all (10u-a).
app.route("/api/jarvis", stateRoutes({ on: door?.settings.on ?? false }));
if (door !== undefined)
  mountDoor(app, { door, chat, memory: memory.ask, session, signedAt, origins: config.origins, log });
explainBoot({ app, db, config, jarvis: door?.settings.on === true ? door.jarvis : undefined, log });
// The admin API on a listener of its own, never the public one (ADR-0002 §6), with the login for its own site, so the
// console's session cookie is its alone; none without ADMIN_PORT. The network that walls it off is deploy's.
const adminApp = adminBoot({ db, config, roles, door, log, ready: () => !draining });
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
