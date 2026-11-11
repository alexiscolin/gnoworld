// The server's own search route over an index of its own (slice 13, C): the journeys' stack has no moderation provider, so no line ever passes
// the bot into the real index. This runs the real route and index code (server/src/search) in the test, seeded with the lines the page shows,
// and answers the page's /api/search from it: the answers are the server's, only the seeding is the test's.
import { logger } from "../../../packages/service/src/log.ts";
import { openDatabase } from "../../../packages/service/src/db.ts";
import { makeApp } from "../../../server/src/app.ts";
import { makeSearch, SEARCH_TABLES } from "../../../server/src/search/index.ts";
import { searchRoutes } from "../../../server/src/search/routes.ts";
import { worldOf } from "../../../server/src/rooms/rooms.ts";

const RULES = { bannedWords: [], linksPerMessage: 3, mentionsPerMessage: 5, linksForNewAccount: 2 };
const ROOMS = ["#bubble", "#bubble/games", "#bubble/news"];

export async function answerSearchFrom(page) {
  const roles = {
    team: new Set(),
    worlds: new Map([["bubble", { rules: RULES, groups: new Map(), rooms: new Map() }]]),
  };
  const db = openDatabase(":memory:", [SEARCH_TABLES]);
  const search = makeSearch(db, { roles: roles, now: Date.now });
  const log = logger("a-pepper-of-forty-characters-0123456789", () => undefined);
  const app = makeApp(log, () => true);
  app.route(
    "/api/search",
    searchRoutes({
      search,
      roles: roles,
      archived: () => false,
      rooms: (world) => ROOMS.filter((room) => worldOf(room) === world),
      perSecond: 1_000_000,
      session: () => undefined,
      origins: ["http://localhost"],
      log,
      now: Date.now,
    }),
  );
  await page.route("**/api/search?*", async (route) => {
    const { search: query } = new URL(route.request().url());
    const answer = await app.request(
      `/api/search${query}`,
      {},
      { incoming: { socket: { remoteAddress: "203.0.113.7" } } },
    );
    await route.fulfill({ status: answer.status, contentType: "application/json", body: await answer.text() });
  });
  return {
    add: (said) => {
      search.add(said);
    },
  };
}
