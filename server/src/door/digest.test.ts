import { createHmac } from "node:crypto";
import type { JarvisDigest, JarvisDigestRequest } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import { BODY_LIMIT } from "../app.ts";
import { answerOf, DOOR, doorApp, sessionOf } from "../testing/door.ts";
import { digestRoutes } from "./digest.ts";
import type { Jarvis } from "./jarvis.ts";

// 10k: POST /api/jarvis/digest, a realm's digest, the same for every reader. Each check before any work, in order: the
// site and the type, the session, the switch, the account's rate, the body; then jarvis, its answer passed on once it
// parses. No room and no quota: the digest is cached in jarvis, its making held by the budget (D195).
type Digested = Awaited<ReturnType<Jarvis["digest"]>>;
const REQUEST = (): JarvisDigestRequest => ({ universe: "onyx", realm: "gno.land/r/demo/poll" });
const made = (): JarvisDigest => ({
  status: "digest",
  digest: { blocks: [{ type: "facts", facts: [{ label: "Members", value: "1,204" }] }] },
  proposal: null,
  height: 1204,
});

interface Options {
  on?: boolean;
  // null builds the route with its own default rate.
  perMinute?: number | null;
  answer?: () => Promise<Digested>;
}
const setup = ({ on = true, perMinute = 10, answer }: Options = {}) => {
  const rate = perMinute === null ? {} : { perMinute };
  const clock = { now: DOOR.t0 };
  const sent: { request: JarvisDigestRequest; signal: AbortSignal }[] = [];
  const door = doorApp(
    (log) =>
      digestRoutes({
        session: sessionOf,
        origins: [DOOR.origin],
        jarvis: {
          digest: (request, signal) => {
            sent.push({ request, signal });
            return answer === undefined ? Promise.resolve({ ok: true, answer: made() }) : answer();
          },
        },
        on,
        ...rate,
        log,
        now: () => clock.now,
      }),
    "/digest",
  );
  const digest = (over: Parameters<typeof door.post>[0] = {}) => door.post({ body: REQUEST(), ...over });
  return { digest, sent, clock, events: door.events };
};

describe("a realm's digest through the door", () => {
  it("asks jarvis for the realm of its universe, its answer passed on", async () => {
    const { digest, sent } = setup();
    expect(await answerOf(await digest())).toEqual([200, made()]);
    expect(sent.map(({ request }) => request)).toEqual([REQUEST()]);
  });

  it("is refused before any work from another site, in another type than JSON, or with no session", async () => {
    const { digest, sent } = setup();
    const refusals: [Parameters<typeof digest>[0], number, string][] = [
      [{ origin: "https://evil.test" }, 403, "forbidden"],
      [{ origin: null }, 403, "forbidden"],
      [{ type: "text/plain" }, 415, "unsupported"],
      [{ token: null }, 401, "unauthenticated"],
      [{ token: "a-token-nobody-holds-000000000000000000000" }, 401, "unauthenticated"],
    ];
    for (const [asked, status, error] of refusals)
      expect(await answerOf(await digest(asked))).toEqual([status, { error }]);
    expect(sent).toEqual([]);
  });

  it("answers off while Jarvis is switched off, after the session, before any other work", async () => {
    const { digest, sent, events } = setup({ on: false, perMinute: 1 });
    expect((await digest({ token: null })).status).toBe(401);
    for (let at = 0; at < 3; at += 1) expect(await answerOf(await digest())).toEqual([200, { status: "off" }]);
    expect(sent).toEqual([]);
    expect(events().at(-1)).toMatch(/^\{"event":"jarvis_off","route":"\/api\/jarvis\/digest","status":200,/);
  });

  it("holds an account to its rate a minute, counted before the body is read", async () => {
    const { digest, clock, sent } = setup({ perMinute: 2 });
    const statuses = [];
    for (let at = 0; at < 3; at += 1) statuses.push((await digest({ body: "no body" })).status);
    expect(statuses).toEqual([400, 400, 429]);
    expect((await digest({ token: DOOR.benToken })).status).toBe(200);
    clock.now += 60_000;
    expect((await digest()).status).toBe(200);
    expect(sent).toHaveLength(2);
  });

  it("refuses a body that is no realm of a universe, before any work", async () => {
    const { digest, sent } = setup();
    const bodies = [
      { universe: "onyx" },
      { universe: "onyx", realm: "gno.land/p/demo/avl" },
      { universe: "Onyx", realm: "gno.land/r/demo/poll" },
      { ...REQUEST(), page: "# forged" },
      "not an object",
    ];
    for (const body of bodies) expect(await answerOf(await digest({ body }))).toEqual([400, { error: "refused" }]);
    expect(sent).toEqual([]);
  });

  it("refuses a body past the server's limit before any work", async () => {
    const { digest, sent } = setup();
    const body = { universe: "onyx", realm: `gno.land/r/${"a".repeat(BODY_LIMIT)}` };
    expect(await answerOf(await digest({ body }))).toEqual([413, { error: "too_large" }]);
    expect(sent).toEqual([]);
  });

  it.each([
    ["none", () => ({ ok: true, answer: { status: "none" } }) as const, [200, { status: "none" }]],
    ["spent", () => ({ ok: true, answer: { status: "spent" } }) as const, [200, { status: "spent" }]],
    ["jarvis's failure", () => ({ ok: false, error: "failed" }) as const, [502, { error: "internal" }]],
    ["an answer of the wrong shape", () => ({ ok: false, error: "shape" }) as const, [502, { error: "internal" }]],
    ["jarvis down", () => ({ ok: false, error: "down" }) as const, [503, { error: "not_ready" }]],
    ["jarvis too slow", () => ({ ok: false, error: "slow" }) as const, [504, { error: "not_ready" }]],
  ])("passes on %s as the client's schema reads it", async (_, result, answer) => {
    const { digest } = setup({ answer: () => Promise.resolve(result()) });
    expect(await answerOf(await digest())).toEqual(answer);
  });

  it("hands jarvis the request's own signal, so the call stops with the page that left", async () => {
    const { digest, sent } = setup();
    const page = new AbortController();
    await digest({ signal: page.signal });
    page.abort();
    expect(sent[0]?.signal.aborted).toBe(true);
  });

  it("logs a refusal and a failure by its own route, its cause and how long jarvis took (red pass, R9)", async () => {
    const answer = () => {
      clock.now += 25;
      return Promise.resolve({ ok: false, error: "slow" } as const);
    };
    const { digest, events, clock } = setup({ answer });
    await digest({ token: null });
    await digest();
    expect(events().map((line) => JSON.parse(line) as unknown)).toEqual([
      { event: "jarvis_refused", route: "/api/jarvis/digest", status: 401, error: "session" },
      {
        event: "jarvis_failed",
        route: "/api/jarvis/digest",
        status: 504,
        error: "slow",
        ms: 25,
        account: createHmac("sha256", DOOR.pepper).update(DOOR.anna).digest("hex"),
      },
    ]);
  });

  it("logs a body's refusal with its account", async () => {
    const { digest, events } = setup();
    await digest({ body: "no body" });
    const account = createHmac("sha256", DOOR.pepper).update(DOOR.anna).digest("hex");
    expect(events().map((line) => JSON.parse(line) as unknown)).toEqual([
      { event: "jarvis_refused", route: "/api/jarvis/digest", status: 400, error: "body", account },
    ]);
  });

  it("takes 10 digests a minute an account by default", async () => {
    const { digest } = setup({ perMinute: null });
    const statuses: number[] = [];
    for (let at = 0; at < 11; at += 1) statuses.push((await digest()).status);
    expect([statuses.slice(0, 10).every((status) => status === 200), statuses[10]]).toEqual([true, 429]);
  });
});
