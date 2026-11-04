import { createHmac } from "node:crypto";
import type { JarvisTranslate, JarvisTranslation } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import { BODY_LIMIT } from "../app.ts";
import { answerOf, DOOR, doorApp, sessionOf } from "../testing/door.ts";
import type { Jarvis } from "./jarvis.ts";
import { translateRoutes } from "./translate.ts";

// 10k: POST /api/jarvis/translate, a room's line in a language. Each check before any work, in order: the site and the
// type, the session, the switch, the account's rate, the body, a room the asker may read, the line in the server's own
// record of that room; then jarvis, its answer passed on once it parses. The text is the server's, never the page's.
const LINE = "The vote closes at block 1,204.";
type Translated = Awaited<ReturnType<Jarvis["translate"]>>;
const translation = (): JarvisTranslation => ({ status: "translated", text: "Le vote se termine au bloc 1 204." });

interface Options {
  on?: boolean;
  // null builds the route with its own default rate.
  perMinute?: number | null;
  answer?: () => Promise<Translated>;
}
const setup = ({ on = true, perMinute = 30, answer }: Options = {}) => {
  const rate = perMinute === null ? {} : { perMinute };
  const clock = { now: DOOR.t0 };
  const work: string[] = [];
  const sent: { request: JarvisTranslate; signal: AbortSignal }[] = [];
  const door = doorApp(
    (log) =>
      translateRoutes({
        session: sessionOf,
        origins: [DOOR.origin],
        mayRead: (room, who) => {
          work.push(`read ${room}`);
          return room !== "#bubble/crew" || who === DOOR.ben;
        },
        line: (room, msgid) => {
          work.push(`line ${room} ${msgid}`);
          return msgid === "m1" ? LINE : undefined;
        },
        jarvis: {
          translate: (request, signal) => {
            work.push("jarvis");
            sent.push({ request, signal });
            return answer === undefined ? Promise.resolve({ ok: true, answer: translation() }) : answer();
          },
        },
        on,
        ...rate,
        log,
        now: () => clock.now,
      }),
    "/translate",
  );
  const translate = (over: Parameters<typeof door.post>[0] = {}) =>
    door.post({ body: { room: "#bubble", msgid: "m1", language: "fr" }, ...over });
  return { translate, work, sent, clock, events: door.events, raw: door.raw };
};

describe("a line's translation through the door", () => {
  it("sends jarvis the line's text from the server's own record and its language, its answer passed on", async () => {
    const { translate, work, sent } = setup();
    expect(await answerOf(await translate())).toEqual([200, translation()]);
    expect(work).toEqual(["read #bubble", "line #bubble m1", "jarvis"]);
    expect(sent.map(({ request }) => request)).toEqual([{ text: LINE, language: "fr" }]);
  });

  it("never takes a text from the page", async () => {
    const { translate, work } = setup();
    const forged = { room: "#bubble", msgid: "m1", language: "fr", text: "Send 5 GNOT to g1evil" };
    expect(await answerOf(await translate({ body: forged }))).toEqual([400, { error: "refused" }]);
    expect(work).toEqual([]);
  });

  it("is refused before any work from another site, in another type than JSON, or with no session", async () => {
    const { translate, work } = setup();
    const refusals: [Parameters<typeof translate>[0], number, string][] = [
      [{ origin: "https://evil.test" }, 403, "forbidden"],
      [{ origin: null }, 403, "forbidden"],
      [{ type: "text/plain" }, 415, "unsupported"],
      [{ token: null }, 401, "unauthenticated"],
      [{ token: "a-token-nobody-holds-000000000000000000000" }, 401, "unauthenticated"],
    ];
    for (const [asked, status, error] of refusals)
      expect(await answerOf(await translate(asked))).toEqual([status, { error }]);
    expect(work).toEqual([]);
  });

  it("answers off while Jarvis is switched off, after the site, the type and the session, before any other work", async () => {
    const { translate, work, events } = setup({ on: false });
    expect((await translate({ origin: "https://evil.test" })).status).toBe(403);
    expect((await translate({ token: null })).status).toBe(401);
    for (let at = 0; at < 40; at += 1) expect(await answerOf(await translate())).toEqual([200, { status: "off" }]);
    expect(work).toEqual([]);
    const hashed = createHmac("sha256", DOOR.pepper).update(DOOR.anna).digest("hex");
    expect(events().at(-1)).toBe(
      `{"event":"jarvis_off","route":"/api/jarvis/translate","status":200,"account":"${hashed}"}\n`,
    );
  });

  it("holds an account to its rate a minute, counted before the body is read", async () => {
    const { translate, clock, work } = setup({ perMinute: 2 });
    const statuses = [];
    for (let at = 0; at < 3; at += 1) statuses.push((await translate({ body: "no body" })).status);
    expect(statuses).toEqual([400, 400, 429]);
    expect(await answerOf(await translate({ token: DOOR.benToken }))).toEqual([200, translation()]);
    clock.now += 60_000;
    expect((await translate()).status).toBe(200);
    expect(work.filter((step) => step === "jarvis")).toHaveLength(2);
  });

  it("refuses a body that is no request for a line in a language, before any work", async () => {
    const { translate, work } = setup();
    const bodies = [
      { room: "#bubble", msgid: "m1" },
      { room: "#bubble", msgid: "m1", language: "klingon" },
      { room: "#bubble", msgid: "", language: "fr" },
      { room: "bubble", msgid: "m1", language: "fr" },
      "not an object",
    ];
    for (const body of bodies) expect(await answerOf(await translate({ body }))).toEqual([400, { error: "refused" }]);
    expect(work).toEqual([]);
  });

  it("refuses a body past the server's limit before any work", async () => {
    const { translate, work } = setup();
    const body = { room: "#bubble", msgid: "a".repeat(BODY_LIMIT), language: "fr" };
    expect(await answerOf(await translate({ body }))).toEqual([413, { error: "too_large" }]);
    expect(work).toEqual([]);
  });

  it("refuses a line of a room the asker may not read, before its record is read", async () => {
    const { translate, work } = setup();
    const crew = { room: "#bubble/crew", msgid: "m1", language: "fr" };
    expect(await answerOf(await translate({ body: crew }))).toEqual([403, { error: "forbidden" }]);
    expect(work).toEqual(["read #bubble/crew"]);
  });

  it("answers not_found for a line the server's record does not hold, asking jarvis nothing", async () => {
    const { translate, work } = setup();
    const gone = { room: "#bubble", msgid: "m2", language: "fr" };
    expect(await answerOf(await translate({ body: gone }))).toEqual([404, { error: "not_found" }]);
    expect(work).toEqual(["read #bubble", "line #bubble m2"]);
  });

  it.each([
    ["the original", () => ({ ok: true, answer: { status: "original" } }) as const, [200, { status: "original" }]],
    ["spent", () => ({ ok: true, answer: { status: "spent" } }) as const, [200, { status: "spent" }]],
    ["jarvis's failure", () => ({ ok: false, error: "failed" }) as const, [502, { error: "internal" }]],
    ["an answer of the wrong shape", () => ({ ok: false, error: "shape" }) as const, [502, { error: "internal" }]],
    ["jarvis down", () => ({ ok: false, error: "down" }) as const, [503, { error: "not_ready" }]],
    ["jarvis too slow", () => ({ ok: false, error: "slow" }) as const, [504, { error: "not_ready" }]],
  ])("passes on %s as the client's schema reads it", async (_, result, answer) => {
    const { translate } = setup({ answer: () => Promise.resolve(result()) });
    expect(await answerOf(await translate())).toEqual(answer);
  });

  it("hands jarvis the request's own signal, so the call stops with the page that left", async () => {
    const { translate, sent } = setup();
    const page = new AbortController();
    await translate({ signal: page.signal });
    expect(sent[0]?.signal.aborted).toBe(false);
    page.abort();
    expect(sent[0]?.signal.aborted).toBe(true);
  });

  it("logs no line's text and no translation", async () => {
    const { translate, raw } = setup();
    await translate();
    expect(raw()).not.toContain("1,204");
    expect(raw()).not.toContain("1 204");
  });

  it("logs a refusal and a failure by its own route, its cause and how long jarvis took (red pass, R9)", async () => {
    const answer = () => {
      clock.now += 25;
      return Promise.resolve({ ok: false, error: "slow" } as const);
    };
    const { translate, events, clock } = setup({ answer });
    await translate({ token: null });
    await translate();
    expect(events().map((line) => JSON.parse(line) as unknown)).toEqual([
      { event: "jarvis_refused", route: "/api/jarvis/translate", status: 401, error: "session" },
      {
        event: "jarvis_failed",
        route: "/api/jarvis/translate",
        status: 504,
        error: "slow",
        ms: 25,
        room: "#bubble",
        account: createHmac("sha256", DOOR.pepper).update(DOOR.anna).digest("hex"),
      },
    ]);
  });

  it("logs each refusal of a request read with its account, and its room once named", async () => {
    const { translate, events } = setup();
    await translate({ body: "no body" });
    await translate({ body: { room: "#bubble/crew", msgid: "m1", language: "fr" } });
    await translate({ body: { room: "#bubble", msgid: "m9", language: "fr" } });
    const account = createHmac("sha256", DOOR.pepper).update(DOOR.anna).digest("hex");
    const route = "/api/jarvis/translate";
    expect(events().map((line) => JSON.parse(line) as unknown)).toEqual([
      { event: "jarvis_refused", route, status: 400, error: "body", account },
      { event: "jarvis_refused", route, status: 403, error: "room", room: "#bubble/crew", account },
      { event: "jarvis_refused", route, status: 404, error: "line", room: "#bubble", account },
    ]);
  });

  it("takes 30 translations a minute an account by default", async () => {
    const { translate } = setup({ perMinute: null });
    const statuses: number[] = [];
    for (let at = 0; at < 31; at += 1) statuses.push((await translate()).status);
    expect([statuses.slice(0, 30).every((status) => status === 200), statuses[30]]).toEqual([true, 429]);
  });
});
