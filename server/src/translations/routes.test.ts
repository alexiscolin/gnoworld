import { Address, LineTranslations } from "@gnoworld/schemas";
import { logger } from "@gnoworld/service/log";
import { describe, expect, it } from "vitest";
import { makeApp } from "../app.ts";
import type { TranslationFlow } from "./flow.ts";
import { translationRoutes } from "./routes.ts";

// GET /api/translations?room&ids&language: the stored translations of lines older than the stream's replay, a missing one made for a
// signed-in reader alone. Checks in order: rate, body, the right to read, then the flow (a GET carries no site check, as the cards' own).
const ORIGIN = "https://gnoworld.test";
const T0 = Date.parse("2026-11-13T12:00:00.000Z");
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");

function setup() {
  const asked: Parameters<TranslationFlow["asked"]>[0][] = [];
  const clock = { now: T0 };
  const lines: string[] = [];
  const app = makeApp(
    logger("a-pepper-of-forty-characters-0123456789", (line) => lines.push(line)),
    () => true,
  );
  app.route(
    "/api/translations",
    translationRoutes({
      flow: {
        asked: (request) => {
          asked.push(request);
          return Promise.resolve({
            room: request.room,
            language: request.language,
            translations: [{ msgid: "m1", status: "original" }],
            pending: [],
          });
        },
      },
      readable: (room, who) => room !== "#bubble/crew" || who === ALICE,
      session: (token) => (token === "alice" ? ALICE : undefined),
      origins: [ORIGIN],
      log: () => undefined,
      now: () => clock.now,
    }),
  );
  const get = (query: string, more: { who?: string; peer?: string; origin?: string | null } = {}) =>
    app.request(
      `/api/translations?${query}`,
      {
        headers: {
          ...(more.origin === null ? {} : { origin: more.origin ?? ORIGIN }),
          ...(more.who === undefined ? {} : { cookie: `__Host-session=${more.who}` }),
        },
      },
      { incoming: { socket: { remoteAddress: more.peer ?? "203.0.113.7" } } },
    );
  return { asked, clock, get, lines };
}
const q = (room: string, ids: string, language = "fr") =>
  `room=${encodeURIComponent(room)}&ids=${ids}&language=${language}`;

describe("GET /api/translations", () => {
  it("answers the flow's translations, and tells it whether the reader is signed in", async () => {
    const t = setup();
    const response = await t.get(q("#bubble", "m1,m2"));
    expect(response.status).toBe(200);
    expect(LineTranslations.parse(await response.json())).toMatchObject({ room: "#bubble", language: "fr" });
    await t.get(q("#bubble", "m1"), { who: "alice" });
    expect(t.asked.map(({ signedIn }) => signedIn)).toEqual([false, true]);
    expect(t.asked[0]).toMatchObject({ room: "#bubble", ids: ["m1", "m2"], language: "fr" });
  });

  it("answers no-store, since a translation goes with its line", async () => {
    expect((await setup().get(q("#bubble", "m1"))).headers.get("cache-control")).toBe("no-store");
  });

  it("refuses a members room to a reader who may not read it, before anything is made", async () => {
    const t = setup();
    expect((await t.get(q("#bubble/crew", "m1"))).status).toBe(403);
    expect((await t.get(q("#bubble/crew", "m1"), { who: "alice" })).status).toBe(200);
    expect(t.asked).toHaveLength(1);
  });

  it("refuses no ids, more than 30, a bad id, a language off the list, no room, and each given twice", async () => {
    const t = setup();
    const ids = (count: number) => Array.from({ length: count }, (_, at) => `m${String(at)}`).join(",");
    expect((await t.get(q("#bubble", ids(30)))).status).toBe(200);
    for (const query of [
      q("#bubble", ""),
      q("#bubble", ids(31)),
      q("#bubble", "m 1"),
      q("#bubble", "m1", "xx"),
      "ids=m1&language=fr",
      `${q("#bubble", "m1")}&language=de`,
      "room=%23bubble&ids=m1",
    ])
      expect((await t.get(query)).status, query).toBe(400);
  });

  it("limits a visitor to 60 asks a minute, and starts again the minute after", async () => {
    const t = setup();
    for (let n = 0; n < 60; n += 1) expect((await t.get(q("#bubble", "m1"))).status).toBe(200);
    expect((await t.get(q("#bubble", "m1"))).status).toBe(429);
    expect((await t.get(q("#bubble", "m1"), { peer: "203.0.113.8" })).status).toBe(200);
    t.clock.now += 61_000;
    expect((await t.get(q("#bubble", "m1"))).status).toBe(200);
  });

  it("checks the rate before the body: a flood of bad asks is limited too", async () => {
    const t = setup();
    for (let n = 0; n < 60; n += 1) await t.get("room=x");
    expect((await t.get(q("#bubble", "m1"))).status).toBe(429);
  });
});
