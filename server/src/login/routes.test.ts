import { createHmac } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { isDeepStrictEqual } from "node:util";
import { Challenge } from "@gnoworld/schemas";
import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { BODY_LIMIT, makeApp } from "../app.ts";
import { openDatabase } from "@gnoworld/service/db";
import { logger } from "@gnoworld/service/log";
import { wallet, type Wallet } from "../testing/signer.ts";
import { LOGIN_TABLES, makeLogin, NONCE_ACTION, NONCE_HOST } from "./login.ts";
import { loginFrom, loginRoutes } from "./routes.ts";
import { makeTickets, TICKET_TABLES } from "./ticket.ts";

// Written out, not imported: a cookie that loses its __Host- prefix must fail here.
const SESSION = "__Host-session";
const PEPPER = "a-pepper-of-forty-characters-0123456789";
const ORIGIN = "https://gnoworld.test";
const PEER = "203.0.113.7";
const PROXY = "10.0.0.2";
const T0 = Date.parse("2026-10-22T12:00:00.000Z");
const MINUTE = 60_000;
const REFUSED = JSON.stringify({ error: "refused" });
const TOO_MANY = JSON.stringify({ error: "too_many" });
const PRINTABLE = /^[\x20-\x7e]*$/;
const Count = z.object({ n: z.number() });

const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

const setup = ({ newAccountsPerHour = 5, nonceCap = 100_000, origins = [ORIGIN] } = {}) => {
  const db = openDatabase(":memory:", [LOGIN_TABLES, TICKET_TABLES, NONCE_HOST, NONCE_ACTION]);
  opened.push(db);
  const clock = { now: T0 };
  const now = (): number => clock.now;
  const lines: string[] = [];
  const log = logger(PEPPER, (line) => lines.push(line));
  const app = makeApp(log, () => true);
  const login = makeLogin(db, { chains: ["onyx-1", "gnoland-1"], now, nonceCap });
  const tickets = makeTickets(db, { now });
  app.route("/api/login", loginRoutes(login, { log, origins, proxy: PROXY, newAccountsPerHour, now, tickets }));
  const rows = (table: string): unknown => db.prepare(`SELECT count(*) AS n FROM ${table}`).get();
  return { app, db, clock, lines, rows, tickets };
};
type App = ReturnType<typeof setup>["app"];

interface Sent {
  body?: unknown;
  origin?: string | undefined;
  type?: string;
  peer?: string | undefined;
  headers?: Record<string, string>;
}
// What @hono/node-server hands a route: the connection, whose peer the visitor is read from.
const connection = (peer: string | undefined) => ({ incoming: { socket: { remoteAddress: peer } } });

const post = (app: App, path: string, sent: Sent = {}) => {
  const { body = {}, type = "application/json", headers = {} } = sent;
  const origin = "origin" in sent ? sent.origin : ORIGIN;
  return app.request(
    `/api/login/${path}`,
    {
      method: "POST",
      headers: { "content-type": type, ...(origin === undefined ? {} : { origin }), ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    },
    connection("peer" in sent ? sent.peer : PEER),
  );
};

const me = (app: App, cookie: string | undefined, peer = PEER) =>
  app.request("/api/login/me", { headers: cookie === undefined ? {} : { cookie } }, connection(peer));
const session = (token: string): string => `${SESSION}=${token}`;
// /me's answer when no session holds: nobody, a 200, so a visitor's page logs no error (Alexis, 2026-10-25).
const NOBODY = JSON.stringify({ address: null });

const challenge = async (app: App, sent: Sent = {}) => {
  const response = await post(app, "challenge", { body: { chainId: "onyx-1" }, ...sent });
  expect(response.status).toBe(200);
  return Challenge.parse(await response.json());
};

const verify = (app: App, made: { nonce: string; text: string }, { who, ...sent }: Sent & { who: Wallet }) =>
  post(app, "verify", {
    ...sent,
    body: { nonce: made.nonce, address: who.address, proof: who.sign("onyx-1", made.text) },
  });

const login = async (app: App, who: Wallet = wallet(), sent: Sent = {}) =>
  verify(app, await challenge(app, sent), { ...sent, who });

const misspelt = (address: string): string => address.slice(0, -1) + (address.endsWith("q") ? "p" : "q");

const tokenOf = (response: Response): string => {
  const cookie = response.headers.get("set-cookie") ?? "";
  const token = new RegExp(`^${SESSION}=([A-Za-z0-9_-]{43});`).exec(cookie)?.[1];
  if (token === undefined) throw new Error(`no token in ${cookie}`);
  return token;
};

const answer = async (response: Response) => [response.status, await response.text()];

describe("logging in", () => {
  it("answers a challenge with exactly its nonce, text and expiry, not to be cached", async () => {
    const { app } = setup();
    const response = await post(app, "challenge", { body: { chainId: "onyx-1" } });
    expect(response.headers.get("cache-control")).toBe("no-store");
    const sent = await response.text();
    const { nonce, text, expiresAt } = Challenge.parse(JSON.parse(sent));
    expect(sent).toBe(JSON.stringify({ nonce, text, expiresAt }));
  });

  it("logs in: a cookie the page cannot read, and a body with the address alone", async () => {
    const { app } = setup();
    const who = wallet();
    const made = await challenge(app);
    expect(made.text).toContain("Domain: gnoworld.test\n");
    const response = await verify(app, made, { who });
    const token = tokenOf(response);
    expect(response.headers.get("set-cookie")).toBe(
      `${SESSION}=${token}; Max-Age=7776000; Path=/; HttpOnly; Secure; SameSite=Strict`,
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await answer(response)).toEqual([200, JSON.stringify({ address: who.address })]);
  });

  it("refuses a proof sent from another listed site than its challenge's, which stays good at home (F427)", async () => {
    const other = "http://localhost:5173";
    const { app } = setup({ origins: [other, ORIGIN] });
    const who = wallet();
    const made = await challenge(app, { origin: other });
    expect(await answer(await verify(app, made, { who, origin: ORIGIN }))).toEqual([400, REFUSED]);
    expect((await verify(app, made, { who, origin: other })).status).toBe(200);
  });

  it("writes the domain of the Origin the challenge came from, port included", async () => {
    const { app } = setup({ origins: ["http://localhost:5173", ORIGIN] });
    expect((await challenge(app, { origin: "http://localhost:5173" })).text).toContain("Domain: localhost:5173\n");
  });

  it("takes any origin of the list", async () => {
    const other = "http://localhost:5173";
    const { app } = setup({ origins: [other, ORIGIN] });
    const made = await challenge(app, { origin: other });
    expect((await verify(app, made, { who: wallet(), origin: other })).status).toBe(200);
  });

  it("sets a fresh token whatever cookie the request brings, and the brought one stays unknown", async () => {
    const { app } = setup();
    const planted = "P".repeat(43);
    const response = await login(app, wallet(), { headers: { cookie: session(planted) } });
    expect(tokenOf(response)).not.toBe(planted);
    expect(await answer(await me(app, session(planted)))).toEqual([200, NOBODY]);
  });
});

describe("the session", () => {
  it("answers the cookie's address at /me, not to be cached, among other cookies too", async () => {
    const { app } = setup();
    const who = wallet();
    const token = tokenOf(await login(app, who));
    for (const cookie of [session(token), `a=1; ${session(token)}; b=2`]) {
      const response = await me(app, cookie);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await answer(response)).toEqual([200, JSON.stringify({ address: who.address })]);
    }
  });

  it("answers nobody to no cookie, an unknown or malformed one, and the token under another name", async () => {
    const { app } = setup();
    const token = tokenOf(await login(app));
    for (const cookie of [
      undefined,
      session("A".repeat(43)),
      session(""),
      session(`${token}x`),
      `session=${token}`,
      `__host-session=${token}`,
    ]) {
      const response = await me(app, cookie);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await answer(response)).toEqual([200, NOBODY]);
    }
  });

  it("logs out: the token ends, the cookie is cleared, and an unknown token gets the same answer", async () => {
    const { app } = setup();
    const token = tokenOf(await login(app));
    const cleared = `${SESSION}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`;
    for (const cookie of [session(token), session(token), session("A".repeat(43)), undefined]) {
      const response = await post(app, "logout", {
        body: {},
        ...(cookie === undefined ? {} : { headers: { cookie } }),
      });
      expect([...(await answer(response)), response.headers.get("set-cookie")]).toEqual([204, "", cleared]);
    }
    expect(await answer(await me(app, session(token)))).toEqual([200, NOBODY]);
  });

  it("never limits /me or a logout", async () => {
    const { app } = setup();
    const token = tokenOf(await login(app));
    for (let i = 0; i < 20; i++) expect((await me(app, session(token))).status).toBe(200);
    for (let i = 0; i < 20; i++) expect((await post(app, "logout", { body: {} })).status).toBe(204);
  });
});

describe("cross-site requests", () => {
  it.each([
    ["no Origin", undefined],
    ["another site's Origin", "https://evil.test"],
    ["the opaque Origin null", "null"],
    ["our site over plain HTTP", "http://gnoworld.test"],
    ["our site with a port", "https://gnoworld.test:8443"],
    ["a subdomain", "https://a.gnoworld.test"],
    ["our Origin with a path", "https://gnoworld.test/"],
  ])("refuses every POST with %s, 403, and changes nothing", async (_, origin) => {
    const { app, rows } = setup();
    const token = tokenOf(await login(app));
    const made = await challenge(app);
    const who = wallet();
    const bodies: [string, unknown][] = [
      ["challenge", { chainId: "onyx-1" }],
      ["verify", { nonce: made.nonce, address: who.address, proof: who.sign("onyx-1", made.text) }],
      ["logout", {}],
    ];
    const before = [rows("nonces"), rows("accounts"), rows("tokens")];
    for (const [path, body] of bodies) {
      const response = await post(app, path, { body: body, origin, headers: { cookie: session(token) } });
      expect(await answer(response)).toEqual([403, JSON.stringify({ error: "forbidden" })]);
    }
    expect([rows("nonces"), rows("accounts"), rows("tokens")]).toEqual(before);
    expect((await me(app, session(token))).status).toBe(200);
    expect((await verify(app, made, { who })).status).toBe(200);
  });

  it("refuses every POST when no origin is configured", async () => {
    const { app } = setup({ origins: [] });
    expect((await post(app, "challenge", { body: { chainId: "onyx-1" } })).status).toBe(403);
  });

  it.each([
    "application/x-www-form-urlencoded",
    "multipart/form-data; boundary=x",
    "text/plain",
    "",
    "application/jsonx",
    "application/json-patch+json",
    "x-application/json",
  ])("refuses a POST sent as %j, 415, before any work", async (type) => {
    const { app, rows } = setup();
    expect(await answer(await post(app, "challenge", { body: { chainId: "onyx-1" }, type }))).toEqual([
      415,
      JSON.stringify({ error: "unsupported" }),
    ]);
    expect(rows("nonces")).toEqual({ n: 0 });
  });

  it("takes JSON with a charset, in any case", async () => {
    const { app } = setup();
    for (const type of ["application/json; charset=utf-8", "application/json ;charset=utf-8", "Application/JSON"]) {
      expect((await post(app, "challenge", { body: { chainId: "onyx-1" }, type })).status).toBe(200);
    }
  });

  it("refuses a POST with no content type at all", async () => {
    const { app } = setup();
    const response = await app.request(
      "/api/login/challenge",
      { method: "POST", headers: { origin: ORIGIN }, body: new Blob([JSON.stringify({ chainId: "onyx-1" })]) },
      connection(PEER),
    );
    expect([response.headers.get("content-type")?.startsWith("application/json"), response.status]).toEqual([
      true,
      415,
    ]);
  });

  it("answers a HEAD as its GET, from any origin", async () => {
    const { app } = setup();
    const token = tokenOf(await login(app));
    const head = (cookie: string) =>
      app.request(
        "/api/login/me",
        { method: "HEAD", headers: { cookie, origin: "https://evil.test" } },
        connection(PEER),
      );
    expect([(await head(session(token))).status, (await head(session("A".repeat(43)))).status]).toEqual([200, 200]);
  });

  it("gives no CORS grant, and a GET to a POST route or a POST to /me does nothing", async () => {
    const { app, rows } = setup();
    const preflight = await app.request(
      "/api/login/verify",
      { method: "OPTIONS", headers: { origin: "https://evil.test", "access-control-request-method": "POST" } },
      connection(PEER),
    );
    expect(preflight.headers.get("access-control-allow-origin")).toBeNull();
    expect(preflight.status).toBeGreaterThanOrEqual(400);
    expect((await app.request("/api/login/challenge", {}, connection(PEER))).status).toBe(404);
    expect((await post(app, "me", { body: {} })).status).toBe(404);
    expect(rows("nonces")).toEqual({ n: 0 });
  });

  it("refuses an Origin or a content type of any kind, never failing", async () => {
    const { app } = setup();
    await fc.assert(
      fc.asyncProperty(fc.stringMatching(PRINTABLE), fc.stringMatching(PRINTABLE), async (origin, type) => {
        fc.pre(origin !== ORIGIN);
        const response = await post(app, "challenge", {
          body: { chainId: "onyx-1" },
          origin,
          type,
          peer: "198.51.100.1",
        });
        expect([403, 415]).toContain(response.status);
      }),
    );
  });
});

describe("refusals", () => {
  it("answers every refused login with the same status, headers and bytes, the cause going to the log only", async () => {
    const { app, clock, lines } = setup();
    const who = wallet();
    const made = await challenge(app);
    const expired = await challenge(app);
    const proof = who.sign("onyx-1", made.text);
    const refusals: [string, string, unknown][] = [
      ["challenge", "a body that is not JSON", "{"],
      ["challenge", "no chain", {}],
      ["challenge", "a chain that is a number", { chainId: 1 }],
      ["challenge", "a field it does not know", { chainId: "onyx-1", debug: true }],
      ["challenge", "a chain off the list", { chainId: "test5" }],
      ["verify", "no nonce", { address: who.address, proof }],
      ["verify", "an address with a bad checksum", { nonce: made.nonce, address: misspelt(who.address), proof }],
      ["verify", "a proof of the wrong shape", { nonce: made.nonce, address: who.address, proof: { signature: "x" } }],
      ["verify", "a field it does not know", { nonce: made.nonce, address: who.address, proof, debug: true }],
      ["verify", "an unknown nonce", { nonce: "A".repeat(22), address: who.address, proof }],
      [
        "verify",
        "a proof for another chain",
        { nonce: made.nonce, address: who.address, proof: who.sign("gnoland-1", made.text) },
      ],
      ["verify", "a spent nonce", { nonce: made.nonce, address: who.address, proof }],
    ];
    const whole = async (response: Response) => ({
      status: response.status,
      headers: [...response.headers.entries()],
      body: await response.text(),
    });
    const seen: { what: string; status: number; headers: [string, string][]; body: string }[] = [];
    for (const [index, [path, what, body]] of refusals.entries()) {
      seen.push({ what, ...(await whole(await post(app, path, { body: body, peer: `198.51.100.${String(index)}` }))) });
    }
    clock.now += 5 * MINUTE;
    seen.push({
      what: "an expired nonce",
      ...(await whole(await verify(app, expired, { who, peer: "198.51.100.99" }))),
    });
    const first = seen[0];
    expect([first?.status, first?.body]).toEqual([400, REFUSED]);
    expect(seen).toEqual(seen.map(({ what }) => ({ ...first, what })));
    const causes = lines.map((line) => /"event":"login_refused".*"error":"(\w+)"/.exec(line)?.[1]).filter(Boolean);
    expect(causes).toEqual([
      "body",
      "body",
      "body",
      "body",
      "chain",
      "body",
      "body",
      "body",
      "body",
      "nonce",
      "proof",
      "nonce",
      "nonce",
    ]);
    const logged = lines.join("");
    for (const secret of [who.address, made.text, made.nonce, proof.signature.signature])
      expect(logged).not.toContain(secret);
  });

  it("logs a login with the account hashed, and never the token, the proof or the address", async () => {
    const { app, lines } = setup();
    const who = wallet();
    const token = tokenOf(await login(app, who));
    await me(app, session(token));
    await post(app, "logout", { body: {}, headers: { cookie: session(token) } });
    const logged = lines.join("");
    expect(logged).toContain('"event":"login","route":"/api/login/verify"');
    expect(logged).toContain(createHmac("sha256", PEPPER).update(who.address).digest("hex"));
    for (const secret of [token, who.address]) expect(logged).not.toContain(secret);
  });

  it("names the route a refusal came to, never the path the request wrote", async () => {
    const { app, lines } = setup();
    await post(app, "challenge", { body: {}, origin: "https://evil.test" });
    await post(app, "verify", { body: "{" });
    expect(lines.map((line) => /"route":"([^"]+)"/.exec(line)?.[1])).toEqual([
      "/api/login/challenge",
      "/api/login/verify",
    ]);
  });

  it("answers a body streamed past the limit with 413, not a refusal", async () => {
    const { app } = setup();
    const response = await app.request(
      "/api/login/challenge",
      {
        method: "POST",
        headers: { origin: ORIGIN, "content-type": "application/json" },
        body: new Blob([`{"chainId":"${"x".repeat(BODY_LIMIT)}"}`]).stream(),
        duplex: "half",
      },
      connection(PEER),
    );
    expect(await answer(response)).toEqual([413, JSON.stringify({ error: "too_large" })]);
  });

  it("answers a body over the limit with 413 before the limiter counts it", async () => {
    const { app } = setup();
    for (let i = 0; i < 20; i++) {
      const response = await post(app, "challenge", { body: `{"chainId":"${"x".repeat(BODY_LIMIT)}"}` });
      expect(await answer(response)).toEqual([413, JSON.stringify({ error: "too_large" })]);
    }
    expect((await post(app, "challenge", { body: { chainId: "onyx-1" } })).status).toBe(200);
  });

  it("answers any body sent to the login with a refusal, never a failure", async () => {
    const { app } = setup();
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("challenge", "verify"),
        fc.oneof(fc.json(), fc.string()),
        fc.ipV4(),
        async (path, body, peer) => {
          const response = await post(app, path, { body: body, peer });
          expect([
            [400, REFUSED],
            [429, TOO_MANY],
          ]).toContainEqual(await answer(response));
        },
      ),
    );
  });

  it("answers a valid proof with any one part replaced by anything, with a login or a refusal, never a failure", async () => {
    const { app } = setup();
    const who = wallet();
    const paths = [
      ["signed", "chain_id"],
      ["signed", "account_number"],
      ["signed", "sequence"],
      ["signed", "fee"],
      ["signed", "msgs"],
      ["signed", "memo"],
      ["signature", "pubKey"],
      ["signature", "signature"],
    ] as const;
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...paths), fc.anything(), fc.ipV4(), async ([part, key], value, peer) => {
        const made = await challenge(app, { peer });
        const proof = who.sign("onyx-1", made.text);
        const changed = { ...proof, [part]: { ...proof[part], [key]: value } };
        const response = await post(app, "verify", {
          body: { nonce: made.nonce, address: who.address, proof: changed },
          peer,
        });
        // As the server reads it: a value that comes out of JSON as the original is no change.
        const sent = (data: unknown): unknown => JSON.parse(JSON.stringify(data));
        expect(response.status).toBe(isDeepStrictEqual(sent(changed), sent(proof)) ? 200 : 400);
      }),
      { numRuns: 60 },
    );
  });

  it("answers any cookie it never set with nobody, and any logout with 204", async () => {
    const { app } = setup();
    await fc.assert(
      fc.asyncProperty(fc.stringMatching(PRINTABLE), async (cookie) => {
        expect(await answer(await me(app, cookie))).toEqual([200, NOBODY]);
        expect((await post(app, "logout", { body: {}, headers: { cookie } })).status).toBe(204);
      }),
    );
  });
});

describe("limits", () => {
  const ask = (app: App, sent: Sent = {}) => post(app, "challenge", { body: { chainId: "onyx-1" }, ...sent });

  it("limits each visitor to 10 login calls a minute, before any work, and leaves another visitor free", async () => {
    const { app, rows } = setup();
    for (let i = 0; i < 10; i++) expect((await ask(app)).status).toBe(200);
    expect(await answer(await ask(app))).toEqual([429, TOO_MANY]);
    expect((await post(app, "verify", { body: "{" })).status).toBe(429);
    expect(rows("nonces")).toEqual({ n: 10 });
    expect((await ask(app, { peer: "203.0.113.8" })).status).toBe(200);
  });

  it("keeps a visitor limited while others come and go, and frees it after a minute, not before", async () => {
    const { app, clock } = setup();
    for (let i = 0; i < 10; i++) await ask(app);
    await ask(app, { peer: "203.0.113.8" });
    await ask(app, { peer: "203.0.113.9" });
    expect((await ask(app)).status).toBe(429);
    clock.now += MINUTE - 1;
    expect((await ask(app)).status).toBe(429);
    clock.now += 1;
    expect((await ask(app)).status).toBe(200);
  });

  it("refuses a limited verify before it spends the nonce, which works once the minute is over", async () => {
    const { app, clock } = setup();
    const who = wallet();
    const made = await challenge(app);
    for (let i = 0; i < 9; i++) await ask(app);
    expect((await verify(app, made, { who })).status).toBe(429);
    clock.now += MINUTE;
    expect((await verify(app, made, { who })).status).toBe(200);
  });

  it("does not count another site's requests against the visitor", async () => {
    const { app } = setup();
    for (let i = 0; i < 20; i++) await ask(app, { origin: "https://evil.test" });
    for (let i = 0; i < 20; i++) await ask(app, { type: "text/plain" });
    for (let i = 0; i < 10; i++) expect((await ask(app)).status).toBe(200);
  });

  it("leaves a visitor at most 50 unspent nonces whatever its pace: 10 a minute, 5 minutes each", async () => {
    const { app, db, clock } = setup();
    let most = 0;
    for (let at = 0; at < 10 * MINUTE; at += 100) {
      clock.now = T0 + at;
      await ask(app);
      const { n } = Count.parse(db.prepare("SELECT count(*) AS n FROM nonces WHERE expires_at > ?").get(clock.now));
      most = Math.max(most, n);
    }
    expect(most).toBe(50);
  });

  it(
    "leaves at most a visitor's 10 nonces after 100,000 challenges from it, and another still gets one",
    { timeout: 120_000 },
    async () => {
      const { app, rows } = setup();
      for (let i = 0; i < 100_000; i++) await ask(app);
      expect(rows("nonces")).toEqual({ n: 10 });
      expect((await ask(app, { peer: "203.0.113.8" })).status).toBe(200);
    },
  );

  it("refuses every challenge once the unspent nonces reach the cap, a new visitor's too", async () => {
    const { app, lines } = setup({ nonceCap: 25 });
    for (const peer of ["192.0.2.1", "192.0.2.2", "192.0.2.3"]) {
      for (let i = 0; i < 10; i++) await ask(app, { peer });
    }
    expect(await answer(await ask(app, { peer: "192.0.2.4" }))).toEqual([429, TOO_MANY]);
    expect(lines.filter((line) => line.includes('"error":"full"'))).toHaveLength(6);
  });

  it("counts the visitor the trusted proxy names in X-Real-IP, only from that proxy, and never X-Forwarded-For", async () => {
    const { app } = setup();
    const through = (peer: string, header: string, named: string): Sent => ({ peer, headers: { [header]: named } });
    for (let i = 0; i < 10; i++) await ask(app, through(PROXY, "x-real-ip", "192.0.2.1"));
    expect((await ask(app, through(PROXY, "x-real-ip", "192.0.2.1"))).status).toBe(429);
    expect((await ask(app, through(PROXY, "x-real-ip", "192.0.2.2"))).status).toBe(200);
    for (let i = 0; i < 10; i++) await ask(app, through(PROXY, "x-forwarded-for", `192.0.2.${String(10 + i)}`));
    expect((await ask(app, through(PROXY, "x-forwarded-for", "192.0.2.99"))).status).toBe(429);
    for (let i = 0; i < 10; i++) await ask(app, through(PEER, "x-real-ip", `192.0.2.${String(30 + i)}`));
    expect((await ask(app, through(PEER, "x-real-ip", "192.0.2.99"))).status).toBe(429);
  });

  it("counts one IPv6 /64 as one visitor, and a request with no peer address under a limit too", async () => {
    const { app } = setup();
    for (let i = 0; i < 10; i++) await ask(app, { peer: `2001:db8:1:2::${String(i + 1)}` });
    expect((await ask(app, { peer: "2001:db8:1:2:ffff::1" })).status).toBe(429);
    expect((await ask(app, { peer: "2001:db8:1:3::1" })).status).toBe(200);
    for (let i = 0; i < 10; i++) expect((await ask(app, { peer: undefined })).status).toBe(200);
    expect((await ask(app, { peer: undefined })).status).toBe(429);
  });

  it("lets a visitor create N accounts an hour, refuses the next, and still logs in one that exists", async () => {
    const { app, clock } = setup({ newAccountsPerHour: 2 });
    const known = wallet();
    expect((await login(app, known)).status).toBe(200);
    expect((await login(app)).status).toBe(200);
    expect(await answer(await login(app))).toEqual([429, TOO_MANY]);
    expect((await login(app, known)).status).toBe(200);
    expect((await login(app, wallet(), { peer: "203.0.113.8" })).status).toBe(200);
    clock.now += 60 * MINUTE - 1;
    expect((await login(app)).status).toBe(429);
    clock.now += 1;
    expect((await login(app)).status).toBe(200);
  });

  it("charges no new account to a forged proof", async () => {
    const { app } = setup({ newAccountsPerHour: 1 });
    const who = wallet();
    for (let i = 0; i < 3; i++) {
      const made = await challenge(app);
      const forged = {
        nonce: made.nonce,
        address: who.address,
        proof: wallet().sign("onyx-1", made.text, who.address),
      };
      expect((await post(app, "verify", { body: forged })).status).toBe(400);
    }
    expect((await login(app, who)).status).toBe(200);
  });
});

describe("the routes", () => {
  it("serve the login's four routes, and nothing under an admin path", () => {
    const { app } = setup();
    const paths = app.routes.filter(({ method }) => method !== "ALL").map(({ method, path }) => `${method} ${path}`);
    expect(paths).toEqual(
      expect.arrayContaining([
        "POST /api/login/challenge",
        "POST /api/login/verify",
        "GET /api/login/me",
        "POST /api/login/logout",
      ]),
    );
    expect(app.routes.filter(({ path }) => /(^|\/)admin(\/|$)/i.test(path))).toEqual([]);
  });
});

describe("the login from the settings", () => {
  const SETTINGS = { chains: ["onyx-1"], origins: [ORIGIN], trustedProxy: undefined, newAccountsPerHour: 5 };
  const mount = (settings: Partial<typeof SETTINGS> = {}, clock?: { now: number }) => {
    const db = openDatabase(":memory:", [LOGIN_TABLES, TICKET_TABLES, NONCE_HOST, NONCE_ACTION]);
    opened.push(db);
    const log = logger(PEPPER, () => true);
    const app = makeApp(log, () => true);
    const options = clock === undefined ? { log } : { log, now: () => clock.now };
    app.route("/api/login", loginFrom(db, { ...SETTINGS, ...settings }, options));
    return app;
  };

  it("asks for a chain of its settings only", async () => {
    const app = mount({ chains: ["test-5"] });
    expect(await answer(await post(app, "challenge", { body: { chainId: "onyx-1" } }))).toEqual([400, REFUSED]);
    expect((await post(app, "challenge", { body: { chainId: "test-5" } })).status).toBe(200);
  });

  it("makes as many new accounts an hour as its settings say", async () => {
    const app = mount({ newAccountsPerHour: 1 });
    expect((await login(app)).status).toBe(200);
    expect(await answer(await login(app))).toEqual([429, TOO_MANY]);
  });

  it("ends a nonce by the clock it is given", async () => {
    const clock = { now: T0 };
    const app = mount({}, clock);
    const made = await challenge(app);
    clock.now += 5 * MINUTE;
    expect(await answer(await verify(app, made, { who: wallet() }))).toEqual([400, REFUSED]);
  });

  it("frees a visitor's limit by the clock it is given", async () => {
    const clock = { now: T0 };
    const app = mount({}, clock);
    for (let call = 0; call < 10; call += 1) await challenge(app);
    expect(await answer(await post(app, "challenge", { body: { chainId: "onyx-1" } }))).toEqual([429, TOO_MANY]);
    clock.now += MINUTE;
    await challenge(app);
  });

  it("mints tickets by the clock it is given, and the system's by default", async () => {
    const clock = { now: T0 };
    const app = mount({}, clock);
    const db = opened.at(-1);
    const minted = await post(app, "ticket", { body: {}, headers: { cookie: session(tokenOf(await login(app))) } });
    expect(minted.status).toBe(200);
    expect(db?.prepare("SELECT expires_at AS at FROM tickets").get()).toEqual({ at: T0 + MINUTE });
    const free = mount();
    const before = Date.now();
    await post(free, "ticket", { body: {}, headers: { cookie: session(tokenOf(await login(free))) } });
    const { at } = z
      .object({ at: z.number() })
      .parse(opened.at(-1)?.prepare("SELECT expires_at AS at FROM tickets").get());
    expect(at).toBeGreaterThanOrEqual(before + MINUTE);
    expect(at).toBeLessThanOrEqual(Date.now() + MINUTE);
  });

  it("gives the public site's session of 90 days by default, and the console's of an hour when asked (10g-7)", async () => {
    const maxAge = async (options: { log: ReturnType<typeof logger>; console?: boolean }) => {
      const db = openDatabase(":memory:", [LOGIN_TABLES, TICKET_TABLES, NONCE_HOST, NONCE_ACTION]);
      opened.push(db);
      const app = makeApp(options.log, () => true);
      app.route("/api/login", loginFrom(db, SETTINGS, options));
      return /Max-Age=(\d+)/.exec((await login(app)).headers.get("set-cookie") ?? "")?.[1];
    };
    const log = logger(PEPPER, () => true);
    expect([await maxAge({ log }), await maxAge({ log, console: true })]).toEqual([String(90 * 24 * 60 * 60), "3600"]);
  });

  it("keeps the system's time by default", async () => {
    const before = Date.now();
    const { expiresAt } = await challenge(mount());
    expect(Date.parse(expiresAt)).toBeGreaterThanOrEqual(before + 5 * MINUTE);
    expect(Date.parse(expiresAt)).toBeLessThanOrEqual(Date.now() + 5 * MINUTE);
  });
});

describe("tickets", () => {
  const TICKET = z.strictObject({ ticket: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });
  const mint = (app: App, cookie: string | undefined, sent: Sent = {}) =>
    post(app, "ticket", { body: {}, ...(cookie === undefined ? {} : { headers: { cookie } }), ...sent });

  it("mints a ticket for the cookie's account, not to be cached, which logs that account in once", async () => {
    const { app, tickets } = setup();
    const who = wallet();
    const token = tokenOf(await login(app, who));
    const response = await mint(app, session(token));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    const { ticket } = TICKET.parse(await response.json());
    expect(tickets.redeem(ticket, who.address)).toBe(who.address);
  });

  it("answers 401 without a session: no cookie, an unknown one, one logged out", async () => {
    const { app, rows } = setup();
    const token = tokenOf(await login(app));
    await post(app, "logout", { body: {}, headers: { cookie: session(token) } });
    for (const cookie of [undefined, session("A".repeat(43)), session(token)]) {
      expect(await answer(await mint(app, cookie))).toEqual([401, JSON.stringify({ error: "unauthenticated" })]);
    }
    expect(rows("tickets")).toEqual({ n: 0 });
  });

  it("refuses another site, a form and a body with a field, minting nothing", async () => {
    const { app, rows } = setup();
    const cookie = session(tokenOf(await login(app)));
    expect((await mint(app, cookie, { origin: "https://evil.test" })).status).toBe(403);
    expect((await mint(app, cookie, { type: "application/x-www-form-urlencoded" })).status).toBe(415);
    expect(await answer(await mint(app, cookie, { body: { account: "x" } }))).toEqual([400, REFUSED]);
    expect(rows("tickets")).toEqual({ n: 0 });
  });

  it("mints 10 a minute for an account, from any visitor, then refuses that account alone", async () => {
    const { app, clock } = setup();
    const mine = session(tokenOf(await login(app)));
    const theirs = session(tokenOf(await login(app)));
    for (let n = 0; n < 10; n += 1)
      expect((await mint(app, mine, { peer: `198.51.100.${String(n)}` })).status).toBe(200);
    expect(await answer(await mint(app, mine, { peer: "198.51.100.99" }))).toEqual([429, TOO_MANY]);
    expect((await mint(app, theirs)).status).toBe(200);
    clock.now += MINUTE;
    expect((await mint(app, mine)).status).toBe(200);
  });

  it("renews the session it mints from", async () => {
    const { app, clock } = setup();
    const cookie = session(tokenOf(await login(app)));
    clock.now = T0 + MINUTE;
    expect((await mint(app, cookie)).status).toBe(200);
    clock.now = T0 + 30 * 24 * 60 * MINUTE + 30_000;
    expect((await me(app, cookie)).status).toBe(200);
  });

  it("leaves a ticket minted before a logout good until its minute ends", async () => {
    const { app, tickets } = setup();
    const who = wallet();
    const cookie = session(tokenOf(await login(app, who)));
    const { ticket } = TICKET.parse(await (await mint(app, cookie)).json());
    await post(app, "logout", { body: {}, headers: { cookie } });
    expect(tickets.redeem(ticket, who.address)).toBe(who.address);
  });

  it("answers any body with a ticket or a refusal, never a failure, and a body past 16 KiB with 413", async () => {
    const { app } = setup();
    const cookie = session(tokenOf(await login(app)));
    await fc.assert(
      fc.asyncProperty(fc.oneof(fc.json(), fc.string()), fc.ipV4(), async (body, peer) => {
        const response = await post(app, "ticket", { body, peer, headers: { cookie } });
        expect([200, 400]).toContain(response.status);
        if (body !== "{}") expect(response.status).toBe(400);
      }),
      { numRuns: 60 },
    );
    const big = await post(app, "ticket", { body: `{"x":"${"x".repeat(BODY_LIMIT)}"}`, headers: { cookie } });
    expect(big.status).toBe(413);
  });

  it("mints 30 a minute for a visitor, whatever the accounts, then refuses that visitor alone", async () => {
    const { app } = setup();
    const cookies: string[] = [];
    for (let n = 0; n < 4; n += 1) cookies.push(session(tokenOf(await login(app))));
    for (const cookie of cookies.slice(0, 3)) {
      for (let n = 0; n < 10; n += 1) expect((await mint(app, cookie)).status).toBe(200);
    }
    expect(await answer(await mint(app, cookies[3]))).toEqual([429, TOO_MANY]);
    expect((await mint(app, cookies[3], { peer: "198.51.100.9" })).status).toBe(200);
  });
});
