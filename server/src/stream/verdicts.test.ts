import type { DatabaseSync } from "node:sqlite";
import { LineVerdicts, VERDICTS_ASKED } from "@gnoworld/schemas";
import { afterEach, describe, expect, it } from "vitest";
import { makeApp } from "../app.ts";
import { openDatabase } from "@gnoworld/service/db";
import { logger } from "@gnoworld/service/log";
import { VERDICT_TABLES } from "../moderation/check.ts";
import { VERDICTS_PER_MINUTE, verdictRoutes } from "./verdicts.ts";

const T0 = Date.parse("2026-10-26T12:00:00.000Z");
const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

// Who may read what, as chat.ts's mayRead answers: #bubble/crew its member's alone, the rest anyone's.
const readable = (room: string, who: string | undefined): boolean => room !== "#bubble/crew" || who === "member";
const TOKENS = new Map([
  ["member-token", "member"],
  ["stranger-token", "stranger"],
]);

// A server holding one verdict of each kind in #bubble, one in #bubble/crew, one in another room.
function setup() {
  const db = openDatabase(":memory:", [VERDICT_TABLES]);
  opened.push(db);
  const insert = db.prepare(
    "INSERT INTO verdicts (msgid, room, account, action, reason, at) VALUES (?, ?, 'g1author', ?, NULL, ?)",
  );
  for (const [msgid, room, action] of [
    ["passed", "#bubble", "pass"],
    ["hidden", "#bubble", "hide"],
    ["unchecked", "#bubble", "unchecked"],
    ["pending", "#bubble", "pending"],
    ["crew", "#bubble/crew", "pass"],
    ["elsewhere", "#garden", "pass"],
  ]) {
    insert.run(msgid ?? "", room ?? "", action ?? "", T0);
  }
  let now = T0;
  const app = makeApp(
    logger("a-pepper-of-forty-characters-0123456789", () => true),
    () => true,
  );
  app.route(
    "/api/verdicts",
    verdictRoutes({
      db,
      readable,
      session: (token) => (token === undefined ? undefined : TOKENS.get(token)),
      visitor: (c) => c.req.header("x-test-visitor") ?? "here",
      now: () => now,
    }),
  );
  const ask = (query: string, { token, visitor }: { token?: string; visitor?: string } = {}) =>
    app.request(`/api/verdicts?${query}`, {
      headers: {
        ...(token === undefined ? {} : { cookie: `__Host-session=${token}` }),
        ...(visitor === undefined ? {} : { "x-test-visitor": visitor }),
      },
    });
  return { ask, later: (ms: number) => (now += ms) };
}
const room = (name: string) => `room=${encodeURIComponent(name)}`;
const ids = (...list: string[]) => `ids=${encodeURIComponent(list.join(","))}`;

// 4g (docs/decisions.md, 2026-10-26): a line older than the stream's replay has its verdict asked here.
describe("GET /api/verdicts", () => {
  it("answers each line's verdict it holds, checked or hidden, and leaves out one unchecked, pending or unknown", async () => {
    const answer = await setup().ask(
      `${room("#bubble")}&${ids("passed", "hidden", "unchecked", "pending", "nowhere")}`,
    );
    expect(answer.status).toBe(200);
    const body = LineVerdicts.parse(await answer.json());
    expect(body).toEqual({
      room: "#bubble",
      verdicts: [
        { msgid: "passed", state: "checked" },
        { msgid: "hidden", state: "hidden" },
      ],
    });
    expect(answer.headers.get("cache-control")).toBe("no-store");
  });

  it("answers a line of the room asked alone: another room's msgid is no line of it", async () => {
    const body = LineVerdicts.parse(
      await (await setup().ask(`${room("#bubble")}&${ids("elsewhere", "passed")}`)).json(),
    );
    expect(body.verdicts).toEqual([{ msgid: "passed", state: "checked" }]);
  });

  it("answers a line asked twice once", async () => {
    const body = LineVerdicts.parse(await (await setup().ask(`${room("#bubble")}&${ids("passed", "passed")}`)).json());
    expect(body.verdicts).toEqual([{ msgid: "passed", state: "checked" }]);
  });

  // The rule GET /api/rooms and the stream keep (3m): a members room's lines to its members alone.
  it("answers a members room to its member, and refuses it to a guest and to an account not of it", async () => {
    const t = setup();
    const asked = `${room("#bubble/crew")}&${ids("crew")}`;
    const member = await t.ask(asked, { token: "member-token" });
    expect(LineVerdicts.parse(await member.json()).verdicts).toEqual([{ msgid: "crew", state: "checked" }]);
    for (const token of [undefined, "stranger-token", "forged-token"]) {
      const refused = await t.ask(asked, token === undefined ? {} : { token });
      expect(refused.status).toBe(403);
      expect(await refused.json()).toEqual({ error: "forbidden" });
    }
  });

  it.each([
    ["no room", ids("passed")],
    ["no ids", room("#bubble")],
    ["two rooms", `${room("#bubble")}&${room("#garden")}&${ids("passed")}`],
    ["two lists of ids", `${room("#bubble")}&${ids("passed")}&${ids("hidden")}`],
    ["a room with no #", `room=bubble&${ids("passed")}`],
    ["a room of its # alone", `${room("#")}&${ids("passed")}`],
    ["a room of 65 characters", `${room("#".padEnd(65, "b"))}&${ids("passed")}`],
    ["a room with a comma", `${room("#a,#b")}&${ids("passed")}`],
    ["an empty id", `${room("#bubble")}&ids=${encodeURIComponent("passed,,hidden")}`],
    ["an id with a space", `${room("#bubble")}&${ids("a b")}`],
    ["an id of 129 characters", `${room("#bubble")}&${ids("m".repeat(129))}`],
    [
      `${String(VERDICTS_ASKED + 1)} ids`,
      `${room("#bubble")}&${ids(...Array.from({ length: VERDICTS_ASKED + 1 }, (_, n) => `m${String(n)}`))}`,
    ],
  ])("refuses %s", async (_, query) => {
    const answer = await setup().ask(query);
    expect(answer.status).toBe(400);
    expect(await answer.json()).toEqual({ error: "refused" });
  });

  // F876: each length at its bound.
  it("takes a room of 64 characters, and ids of one and of 128 characters", async () => {
    const t = setup();
    expect((await t.ask(`${room("#".padEnd(64, "b"))}&${ids("passed")}`)).status).toBe(200);
    expect((await t.ask(`${room("#bubble")}&${ids("p", "m".repeat(128))}`)).status).toBe(200);
  });

  it(`takes ${String(VERDICTS_ASKED)} ids`, async () => {
    const list = Array.from({ length: VERDICTS_ASKED }, (_, n) => `m${String(n)}`);
    expect((await setup().ask(`${room("#bubble")}&${ids(...list)}`)).status).toBe(200);
  });

  // Like the other routes' limits: a visitor's requests a minute, refused past them until the minute ends.
  it(`answers a visitor ${String(VERDICTS_PER_MINUTE)} times a minute, then refuses until the next minute, another visitor still answered`, async () => {
    const t = setup();
    const asked = `${room("#bubble")}&${ids("passed")}`;
    for (let n = 0; n < VERDICTS_PER_MINUTE; n += 1) expect((await t.ask(asked, { visitor: "a" })).status).toBe(200);
    const over = await t.ask(asked, { visitor: "a" });
    expect(over.status).toBe(429);
    expect(await over.json()).toEqual({ error: "too_many" });
    expect((await t.ask(asked, { visitor: "b" })).status).toBe(200);
    t.later(60_000);
    expect((await t.ask(asked, { visitor: "a" })).status).toBe(200);
  });

  it("counts a refused request against the visitor too", async () => {
    const t = setup();
    for (let n = 0; n < VERDICTS_PER_MINUTE; n += 1)
      expect((await t.ask("room=bad", { visitor: "a" })).status).toBe(400);
    expect((await t.ask(`${room("#bubble")}&${ids("passed")}`, { visitor: "a" })).status).toBe(429);
  });
});
