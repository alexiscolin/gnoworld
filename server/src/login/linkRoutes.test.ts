import { createHmac } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { Address, type Challenge, type Proof } from "@gnoworld/schemas";
import { openDatabase } from "@gnoworld/service/db";
import { logger } from "@gnoworld/service/log";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { BODY_LIMIT, makeApp } from "../app.ts";
import { migrations } from "../migrations.ts";
import { cliFile, cliKey } from "../testing/cliSigner.ts";
import { cliDocument } from "./cliProof.ts";
import { linkRoutes, serverLinks } from "./linkRoutes.ts";
import type { Links } from "./links.ts";

// Part 4 of the owners' moderation (docs/plans/owners-moderation.md, section 5 and the threat model's rows): /api/links. Every route has the
// guard (a listed Origin, JSON for a POST, no-store), the session, strict bodies, one refusal shape, and limits of its own. A session that
// signed more than 10 minutes ago is `unauthenticated` (the answer words have no "stale": the page signs in again, as for no session).
const ORIGIN = "https://gnoworld.test";
const PROXY = "10.0.0.2";
const T0 = Date.parse("2026-11-11T12:00:00.000Z");
const MINUTE = 60_000;
const PEPPER = "a-pepper-of-forty-characters-0123456789";
const A = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const B = Address.parse("g1m68zzc430znqyxzv6jsfz45hgccacx3mk6qajw");
const C = Address.parse("g1zgldsmn6ck6w4p325xd3j8y779ky6fpjnz3uh9");
const D = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const E = Address.parse("g1mpkp5lm8lwpm0pym4388836d009zfe4maxlqsq");
const hmac = (who: string): string =>
  createHmac("sha256", "a-pepper-of-forty-characters-0123456789").update(who).digest("hex");
const NONCE = "AAAAAAAAAAAAAAAAAAAAAA";
const MARKER = "PASTE-MARKER-9f3c1d7a";
const PROOF: Proof = {
  signed: {
    chain_id: "onyx-1",
    account_number: "0",
    sequence: "0",
    fee: { amount: [], gas: "0" },
    msgs: [],
    memo: "m",
  },
  signature: { pubKey: { typeUrl: "/tm.PubKeySecp256k1", value: "AA==" }, signature: "AA==" },
};
const CHALLENGE: Challenge = { nonce: NONCE, text: "Link text", expiresAt: "2026-11-11T12:10:00.000Z" };
const TOKENS = new Map<string, Address>([
  ["a", A],
  ["a2", A],
  ["b", B],
  ["c", C],
  ["d", D],
  ["e", E],
  ["old", A],
  ["edge", A],
  ["over", A],
  ["nosigned", A],
]);
const SIGNED = new Map<string, number>([
  ["old", T0 - 11 * MINUTE],
  ["edge", T0 - 10 * MINUTE],
  ["over", T0 - 10 * MINUTE - 1],
]);

type Calls = Record<"start" | "finish" | "unlink" | "list" | "worlds" | "startRelease" | "finishRelease", unknown[]>;
interface Script {
  start?: ReturnType<Links["startLink"]>;
  finish?: Awaited<ReturnType<Links["finishLink"]>> | Error;
  unlink?: ReturnType<Links["unlink"]>;
  startRelease?: ReturnType<Links["startRelease"]>;
  finishRelease?: Awaited<ReturnType<Links["finishRelease"]>> | Error;
  list?: ReturnType<Links["list"]>;
}

function fakeLinks(script: Script, calls: Calls): Links {
  return {
    startLink: (request) => {
      calls.start.push(request);
      return script.start ?? CHALLENGE;
    },
    finishLink: (request) => {
      calls.finish.push(request);
      const answer = script.finish ?? { members: [A, B] };
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
    },
    unlink: (request) => {
      calls.unlink.push(request);
      return script.unlink ?? { members: [A] };
    },
    startRelease: (request) => {
      calls.startRelease.push(request);
      return script.startRelease ?? CHALLENGE;
    },
    finishRelease: (request) => {
      calls.finishRelease.push(request);
      const answer = script.finishRelease ?? "released";
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
    },
    identityOf: (address) => [address],
    list: (address) => {
      calls.list.push(address);
      return script.list ?? [{ address, kind: "adena", linkedAt: T0 }];
    },
  };
}

const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

interface Setup {
  script?: Script;
  real?: boolean;
  block?: (address: Address, memo: string) => string;
}
function setup({ script = {}, real = false, block = (address, memo) => `BLOCK ${address} ${memo}` }: Setup = {}) {
  const calls: Calls = { start: [], finish: [], unlink: [], list: [], worlds: [], startRelease: [], finishRelease: [] };
  const clock = { now: T0 };
  const lines: string[] = [];
  const log = logger("a-pepper-of-forty-characters-0123456789", (line) => lines.push(line));
  let links = fakeLinks(script, calls);
  let database: DatabaseSync | undefined;
  if (real) {
    const db = openDatabase(":memory:", migrations);
    opened.push(db);
    database = db;
    const made = serverLinks(db, {
      now: () => clock.now,
      chainId: "onyx-1",
      secret: PEPPER,
    });
    links = made;
  }
  const app = makeApp(log, () => true);
  app.route(
    "/api/links",
    linkRoutes({
      links,
      session: (token) => TOKENS.get(token ?? ""),
      // "nosigned" has a session and no signing time; "unseen" has a signing time and no session.
      signedAt: (token) => {
        if (token === "unseen") return clock.now;
        if (token === "nosigned") return undefined;
        return TOKENS.has(token ?? "") ? (SIGNED.get(token ?? "") ?? clock.now - MINUTE) : undefined;
      },
      worldsOf: (members, visitor) => {
        calls.worlds.push([members, visitor]);
        return Promise.resolve(["acme-feed"]);
      },
      block,
      chainId: "onyx-1",
      origins: [ORIGIN],
      proxy: PROXY,
      log,
      now: () => clock.now,
    }),
  );
  interface Ask {
    who?: string;
    visitor?: string;
    origin?: string | null;
    type?: string | null;
    host?: string;
  }
  const headersOf = (
    method: string,
    { who, visitor = "203.0.113.7", origin = ORIGIN, type = "application/json", host }: Ask,
  ) => ({
    "x-real-ip": visitor,
    ...(host === undefined ? {} : { host }),
    ...(origin === null ? {} : { origin }),
    ...(type === null || method === "GET" ? {} : { "content-type": type }),
    ...(who === undefined ? {} : { cookie: `__Host-session=${who}` }),
  });
  const ask = (method: string, path: string, more: Ask & { body?: unknown }) =>
    app.request(
      `/api/links${path}`,
      {
        method,
        headers: headersOf(method, more),
        ...(more.body === undefined
          ? {}
          : { body: typeof more.body === "string" ? more.body : JSON.stringify(more.body) }),
      },
      { incoming: { socket: { remoteAddress: PROXY } } },
    );
  return {
    db: database,
    calls,
    clock,
    lines,
    get: (more: Ask = {}, query = "") => ask("GET", query, more),
    challenge: (body: unknown, more: Ask = {}) => ask("POST", "/challenge", { ...more, body }),
    verify: (body: unknown, more: Ask = {}) => ask("POST", "/verify", { ...more, body }),
    unlink: (body: unknown, more: Ask = {}) => ask("POST", "/unlink", { ...more, body }),
    releaseChallenge: (body: unknown, more: Ask = {}) => ask("POST", "/release/challenge", { ...more, body }),
    releaseVerify: (body: unknown, more: Ask = {}) => ask("POST", "/release/verify", { ...more, body }),
  };
}
type T = ReturnType<typeof setup>;

const adena = { kind: "adena", address: B };
const verifyAdena = { nonce: NONCE, address: B, proof: PROOF };
const unlinkB = { address: B };
const ROUTES = [
  ["challenge", adena],
  ["verify", verifyAdena],
  ["unlink", unlinkB],
] as const;

describe("GET /api/links", () => {
  it("answers the session's identity alone: members with kind and date, the worlds hint, never cached", async () => {
    const t = setup();
    const response = await t.get({ who: "a" });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      members: [{ address: A, kind: "adena", linkedAt: T0 }],
      worlds: ["acme-feed"],
      linked: false,
    });
    expect(t.calls.list).toEqual([A]);
  });

  it("asks the list for the session's account, never for an address the query names", async () => {
    const t = setup();
    await t.get({ who: "c" }, `?address=${A}`);
    expect(t.calls.list).toEqual([C]);
  });

  it("answers a session of 11 minutes: a list is read, not changed", async () => {
    expect((await setup().get({ who: "old" })).status).toBe(200);
  });

  it("limits a visitor to 30 reads a minute, and gives the worlds read the account and the visitor together", async () => {
    const t = setup();
    for (let i = 0; i < 30; i += 1) expect((await t.get({ who: "a" })).status).toBe(200);
    const over = await t.get({ who: "a" });
    expect([over.status, await over.json()]).toEqual([429, { error: "too_many" }]);
    const keys = t.calls.worlds.map((call) => (call as [Address[], string])[1]);
    expect(keys).toHaveLength(30);
    expect(keys[0]).not.toContain(A);
    expect(keys[0]).not.toContain("203.0.113.7");
    const other = setup();
    await other.get({ who: "a" }, "");
    await other.get({ who: "c" }, "");
    await other.get({ who: "a", visitor: "203.0.113.9" }, "");
    expect(new Set(other.calls.worlds.map((call) => (call as [Address[], string])[1])).size).toBe(3);
  });

  it("makes no worlds read for a guest", async () => {
    const t = setup();
    await t.get();
    expect(t.calls.worlds).toEqual([]);
  });

  it("answers no session with unauthenticated, in the one refusal shape", async () => {
    const response = await setup().get();
    expect([response.status, await response.json()]).toEqual([401, { error: "unauthenticated" }]);
  });
});

describe.each(ROUTES)("POST /%s: the gates", (name, good) => {
  it.each([
    ["an Origin not listed", { who: "a", origin: "https://evil.test" }, [403, "forbidden"]],
    ["no Origin", { who: "a", origin: null }, [403, "forbidden"]],
    ["a body that is not JSON", { who: "a", type: "text/plain" }, [415, "unsupported"]],
    ["no session", {}, [401, "unauthenticated"]],
    ["a session of 11 minutes (stale)", { who: "old" }, [401, "unauthenticated"]],
  ])("refuses %s, the links asked nothing", async (_, more, [status, error]) => {
    const t = setup();
    const response = await t[name](good, more);
    expect([response.status, await response.json()]).toEqual([status, { error }]);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(t.calls.start.length + t.calls.finish.length + t.calls.unlink.length).toBe(0);
  });

  it.each([
    ["a body that is no JSON", "{not json"],
    ["an array", [good]],
    ["a field of the page's own, `by`", { ...good, by: C }],
    ["an address that is no address", { ...good, address: "g1short" }],
    ["no address", { ...good, address: undefined }],
  ])("refuses %s as refused, the links asked nothing", async (_, body) => {
    const t = setup();
    const response = await t[name](body, { who: "a" });
    expect([response.status, await response.json()]).toEqual([400, { error: "refused" }]);
    expect(t.calls.start.length + t.calls.finish.length + t.calls.unlink.length).toBe(0);
  });

  it("limits a visitor to 10 calls a minute before it reads the session, a new minute starting again", async () => {
    const t = setup();
    for (let i = 0; i < 10; i += 1) await t[name](good, {});
    const over = await t[name](good, {});
    expect([over.status, await over.json()]).toEqual([429, { error: "too_many" }]);
    expect((await t[name](good, { visitor: "203.0.113.8" })).status).toBe(401);
    t.clock.now += MINUTE;
    expect((await t[name](good, {})).status).toBe(401);
  });

  it("limits an account to 30 calls an hour, whichever visitor it comes from", async () => {
    const t = setup();
    for (let i = 0; i < 30; i += 1) {
      t.clock.now += MINUTE;
      await t[name](good, { who: "a", visitor: `203.0.113.${String(i + 20)}` });
    }
    t.clock.now += MINUTE;
    const over = await t[name](good, { who: "a2", visitor: "203.0.113.99" });
    expect([over.status, await over.json()]).toEqual([429, { error: "too_many" }]);
  });
});

describe("POST /api/links/challenge", () => {
  it("starts an Adena code for the session's account, by the session, the host of the listed Origin and the session's signing time", async () => {
    const t = setup();
    const response = await t.challenge(adena, { who: "a", host: "evil.test" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ...CHALLENGE, chainId: "onyx-1" });
    expect(t.calls.start).toEqual([{ by: A, kind: "adena", subject: B, host: "gnoworld.test", signedAt: T0 - MINUTE }]);
  });

  it("answers a command-line code with the memo (the signed text) and the block the server composes", async () => {
    const t = setup();
    const response = await t.challenge({ kind: "cli", address: B }, { who: "a" });
    expect(await response.json()).toEqual({
      nonce: NONCE,
      memo: CHALLENGE.text,
      block: `BLOCK ${B} ${CHALLENGE.text}`,
      expiresAt: CHALLENGE.expiresAt,
    });
  });

  it.each([
    ["pending", 429, "too_many"],
    ["full", 429, "too_many"],
    ["members", 409, "full"],
    ["self", 400, "refused"],
    ["text", 400, "refused"],
    ["stale", 401, "unauthenticated"],
  ] as const)("words the links' %s as %s %s, never a 500", async (cause, status, error) => {
    const t = setup({ script: { start: cause } });
    const response = await t.challenge(adena, { who: "a" });
    expect([response.status, await response.json()]).toEqual([status, { error }]);
  });

  it("refuses a kind that is neither adena nor cli", async () => {
    const t = setup();
    expect((await t.challenge({ kind: "ledger", address: B }, { who: "a" })).status).toBe(400);
  });

  it("caps the codes pending from one visitor's /64 at 10, whichever accounts ask, and counts only the codes issued (F13833)", async () => {
    const t = setup();
    const near = (n: number) => `2001:db8:1:2::${String(n)}`;
    // Ten refused ones (stale) count for nothing.
    for (let i = 0; i < 10; i += 1) {
      t.clock.now += 5_000;
      expect((await t.challenge(adena, { who: "old", visitor: near(i + 1) })).status).toBe(401);
    }
    for (const [i, who] of ["a", "b", "c", "d", "e", "a", "b", "c", "d", "e"].entries()) {
      t.clock.now += 20_000;
      expect((await t.challenge(adena, { who, visitor: near(i + 1) })).status).toBe(200);
    }
    const over = await t.challenge({ kind: "adena", address: C }, { who: "e", visitor: near(99) });
    expect([over.status, await over.json()]).toEqual([429, { error: "too_many" }]);
    const elsewhere = await t.challenge(adena, { who: "e", visitor: "2001:db8:9:9::1" });
    expect(elsewhere.status).toBe(200);
  });

  it("frees the cap when the codes have lived their 10 minutes", async () => {
    const t = setup();
    for (let i = 0; i < 10; i += 1) {
      t.clock.now += 20_000;
      await t.challenge(adena, { who: i < 5 ? "a" : "b", visitor: "203.0.113.5" });
    }
    expect((await t.challenge(adena, { who: "c", visitor: "203.0.113.5" })).status).toBe(429);
    t.clock.now += 10 * MINUTE + 1;
    expect((await t.challenge(adena, { who: "c", visitor: "203.0.113.5" })).status).toBe(200);
  });
});

describe("POST /api/links/verify", () => {
  it("finishes an Adena link as the session's account with the proof, the code, the address and the Origin's host", async () => {
    const t = setup();
    const response = await t.verify(verifyAdena, { who: "a", host: "evil.test" });
    expect([response.status, await response.json()]).toEqual([200, { members: [A, B] }]);
    expect(t.calls.finish).toEqual([
      { kind: "adena", nonce: NONCE, by: A, address: B, proof: PROOF, host: "gnoworld.test", signedAt: T0 - MINUTE },
    ]);
  });

  it("finishes a command-line link with the pasted file as it is, the address with it", async () => {
    const t = setup();
    const response = await t.verify({ nonce: NONCE, address: B, file: "{}" }, { who: "a" });
    expect(response.status).toBe(200);
    expect(t.calls.finish).toEqual([
      { kind: "cli", nonce: NONCE, by: A, address: B, file: "{}", host: "gnoworld.test", signedAt: T0 - MINUTE },
    ]);
  });

  it.each([
    ["a proof and a file together", { ...verifyAdena, file: "{}" }],
    ["neither a proof nor a file", { nonce: NONCE, address: B }],
    ["a file that is not a string", { nonce: NONCE, address: B, file: { msg: [] } }],
    ["a code that is no code", { ...verifyAdena, nonce: "short" }],
    ["a file of 4097 bytes", { nonce: NONCE, address: B, file: "x".repeat(4097) }],
    ["a file of 2100 letters of two bytes", { nonce: NONCE, address: B, file: "é".repeat(2100) }],
  ])("refuses %s, nothing finished", async (_, body) => {
    const t = setup();
    const response = await t.verify(body, { who: "a" });
    expect([response.status, await response.json()]).toEqual([400, { error: "refused" }]);
    expect(t.calls.finish).toEqual([]);
  });

  it("accepts a file of exactly 4096 bytes", async () => {
    const t = setup();
    expect((await t.verify({ nonce: NONCE, address: B, file: "x".repeat(4096) }, { who: "a" })).status).toBe(200);
  });

  it.each([
    ["nonce", 404, "not_found"],
    ["proof", 400, "refused"],
    ["linked", 403, "forbidden"],
    ["members", 409, "full"],
    ["stale", 401, "unauthenticated"],
  ] as const)("words the links' %s as %s %s", async (cause, status, error) => {
    const t = setup({ script: { finish: cause } });
    const response = await t.verify(verifyAdena, { who: "a" });
    expect([response.status, await response.json()]).toEqual([status, { error }]);
  });

  it("tells a code that is no good (404) from a proof that is no good (400), so the dialog can say what to do", async () => {
    const [one, two] = [setup({ script: { finish: "nonce" } }), setup({ script: { finish: "proof" } })];
    const [x, y] = [await one.verify(verifyAdena, { who: "a" }), await two.verify(verifyAdena, { who: "a" })];
    expect([x.status, await x.json()]).toEqual([404, { error: "not_found" }]);
    expect([y.status, await y.json()]).toEqual([400, { error: "refused" }]);
  });

  it("puts no byte of a refused paste in a log line or an error body, whatever fails", async () => {
    const file = JSON.stringify({ msg: [], note: MARKER });
    for (const script of [{ finish: "proof" }, { finish: "nonce" }, { finish: new Error(`bad ${file}`) }] as const) {
      const t = setup({ script });
      const response = await t.verify({ nonce: NONCE, address: B, file }, { who: "a" });
      expect(await response.text()).not.toContain(MARKER);
      expect(t.lines.join("\n")).not.toContain(MARKER);
    }
    const t = setup();
    const refused = await t.verify({ nonce: NONCE, address: B, file: MARKER.repeat(400), extra: 1 }, { who: "a" });
    expect(await refused.text()).not.toContain(MARKER);
    expect(t.lines.join("\n")).not.toContain(MARKER);
    const oversize = setup();
    const big = await oversize.verify({ nonce: NONCE, address: B, file: `${MARKER}${"x".repeat(5000)}` }, { who: "a" });
    expect(await big.text()).not.toContain(MARKER);
    expect(oversize.lines.join("\n")).not.toContain(MARKER);
  });
});

describe("POST /api/links/unlink", () => {
  it("unlinks as the session's account, with its signing time, and answers the members left", async () => {
    const t = setup();
    const response = await t.unlink(unlinkB, { who: "a" });
    expect([response.status, await response.json()]).toEqual([200, { members: [A] }]);
    expect(t.calls.unlink).toEqual([{ by: A, address: B, signedAt: T0 - MINUTE }]);
  });

  it("answers an address of no identity of the account's and one of a free account the same way (none)", async () => {
    const t = setup({ script: { unlink: "none" } });
    const response = await t.unlink(unlinkB, { who: "a" });
    expect([response.status, await response.json()]).toEqual([404, { error: "not_found" }]);
  });
});

describe("with the real links", () => {
  const issued = async (t: T, who: string, body: unknown) => {
    const response = await t.challenge(body, { who });
    expect(response.status).toBe(200);
    return z
      .object({ nonce: z.string(), text: z.string().optional(), memo: z.string().optional() })
      .parse(await response.json());
  };

  it("links a good command-line file, so the server is never built without the command line's verifier (F13858)", async () => {
    const t = setup({ real: true });
    const key = cliKey();
    const code = await issued(t, "a", { kind: "cli", address: key.address });
    const response = await t.verify(
      { nonce: code.nonce, address: key.address, file: cliFile(key, code.memo ?? "") },
      { who: "a" },
    );
    expect([response.status, await response.json()]).toEqual([200, { members: [A, key.address].toSorted() }]);
  });

  it("refuses a file signed by another key, with no member added", async () => {
    const t = setup({ real: true });
    const [key, other] = [cliKey(), cliKey()];
    const code = await issued(t, "a", { kind: "cli", address: key.address });
    const response = await t.verify(
      { nonce: code.nonce, address: key.address, file: cliFile(other, code.memo ?? "") },
      { who: "a" },
    );
    expect([response.status, await response.json()]).toEqual([400, { error: "refused" }]);
    expect(await (await t.get({ who: "a" })).json()).toMatchObject({ members: [], linked: false });
  });

  it("refuses a code issued to another session: A's code finishes no link as C", async () => {
    const t = setup({ real: true });
    const key = cliKey();
    const code = await issued(t, "a", { kind: "cli", address: key.address });
    const response = await t.verify(
      { nonce: code.nonce, address: key.address, file: cliFile(key, code.memo ?? "") },
      { who: "c" },
    );
    expect(response.status).toBe(404);
  });

  it("spends a code once: the file replayed after a link is refused, two at once make one link", async () => {
    const t = setup({ real: true });
    const key = cliKey();
    const code = await issued(t, "a", { kind: "cli", address: key.address });
    const body = { nonce: code.nonce, address: key.address, file: cliFile(key, code.memo ?? "") };
    const both = await Promise.all([t.verify(body, { who: "a" }), t.verify(body, { who: "a" })]);
    expect(both.map((r) => r.status).toSorted()).toEqual([200, 404]);
    expect((await t.verify(body, { who: "a" })).status).toBe(404);
  });

  it("refuses an expired code", async () => {
    const t = setup({ real: true });
    const key = cliKey();
    const code = await issued(t, "a", { kind: "cli", address: key.address });
    t.clock.now += 10 * MINUTE + 1;
    const response = await t.verify(
      { nonce: code.nonce, address: key.address, file: cliFile(key, code.memo ?? "") },
      { who: "a" },
    );
    expect(response.status).toBe(404);
  });

  it("answers a bad proof for a free address and for an address linked elsewhere with the same refusal", async () => {
    const t = setup({ real: true });
    const key = cliKey();
    const code = await issued(t, "a", { kind: "cli", address: key.address });
    await t.verify({ nonce: code.nonce, address: key.address, file: cliFile(key, code.memo ?? "") }, { who: "a" });
    const [linked, free] = [cliKey(), cliKey()];
    const answers: [number, string][] = [];
    for (const target of [key, free, linked]) {
      const made = await issued(t, "c", { kind: "cli", address: target.address });
      const response = await t.verify(
        { nonce: made.nonce, address: target.address, file: cliFile(cliKey(), made.memo ?? "") },
        { who: "c" },
      );
      answers.push([response.status, await response.text()]);
    }
    expect(new Set(answers.map(([, text]) => text)).size).toBe(1);
    expect(new Set(answers.map(([status]) => status)).size).toBe(1);
  });

  const linked = async (t: T): Promise<ReturnType<typeof cliKey>> => {
    const key = cliKey();
    const made = await issued(t, "a", { kind: "cli", address: key.address });
    await t.verify({ nonce: made.nonce, address: key.address, file: cliFile(key, made.memo ?? "") }, { who: "a" });
    return key;
  };

  it("answers an unknown code alike for an address linked elsewhere and a free one, and a bad proof alike (the privacy rule)", async () => {
    const t = setup({ real: true });
    const key = await linked(t);
    const unknown: [number, string][] = [];
    for (const address of [key.address, cliKey().address]) {
      const visitor = `203.0.113.${String(unknown.length + 80)}`;
      const response = await t.verify({ nonce: NONCE, address, file: "{}" }, { who: "c", visitor });
      unknown.push([response.status, await response.text()]);
    }
    expect(unknown[0]).toEqual(unknown[1]);
    expect(unknown[0]?.[0]).toBe(404);
    const bad: [number, string][] = [];
    for (const target of [key, cliKey()]) {
      const made = await issued(t, "c", { kind: "cli", address: target.address });
      const visitor = `203.0.113.${String(bad.length + 90)}`;
      const file = cliFile(cliKey(), made.memo ?? "");
      const response = await t.verify({ nonce: made.nonce, address: target.address, file }, { who: "c", visitor });
      bad.push([response.status, await response.text()]);
    }
    expect(bad[0]).toEqual(bad[1]);
    expect(bad[0]?.[0]).toBe(400);
  });

  it("says forbidden, once the proof has passed, for a key already linked to another identity", async () => {
    const t = setup({ real: true });
    const key = await linked(t);
    const made = await issued(t, "c", { kind: "cli", address: key.address });
    const file = cliFile(key, made.memo ?? "");
    const response = await t.verify({ nonce: made.nonce, address: key.address, file }, { who: "c" });
    expect([response.status, await response.json()]).toEqual([403, { error: "forbidden" }]);
  });

  it("answers a challenge for an address linked elsewhere as for a free one: the refusal waits for the proof", async () => {
    const t = setup({ real: true });
    const key = cliKey();
    const code = await issued(t, "a", { kind: "cli", address: key.address });
    await t.verify({ nonce: code.nonce, address: key.address, file: cliFile(key, code.memo ?? "") }, { who: "a" });
    const [linked, free] = [
      await t.challenge({ kind: "cli", address: key.address }, { who: "c" }),
      await t.challenge({ kind: "cli", address: cliKey().address }, { who: "c" }),
    ];
    expect([linked.status, Object.keys((await linked.json()) as object)]).toEqual([
      free.status,
      Object.keys((await free.json()) as object),
    ]);
  });

  it("unlinks, and the list then holds the account alone", async () => {
    const t = setup({ real: true });
    const key = cliKey();
    const code = await issued(t, "a", { kind: "cli", address: key.address });
    await t.verify({ nonce: code.nonce, address: key.address, file: cliFile(key, code.memo ?? "") }, { who: "a" });
    expect((await t.unlink({ address: key.address }, { who: "a" })).status).toBe(200);
    expect(await (await t.get({ who: "a" })).json()).toMatchObject({ members: [], linked: false });
  });
});

describe("freshness, size and the log (part 4's red pass)", () => {
  const events = (t: T, event: string) =>
    t.lines
      .map((line) => z.record(z.string(), z.unknown()).parse(JSON.parse(line)))
      .filter((line) => line["event"] === event);

  it.each(ROUTES)(
    "accepts a session of exactly 10 minutes and refuses one a millisecond older, on %s",
    async (name, good) => {
      const t = setup();
      expect((await t[name](good, { who: "edge" })).status).toBe(200);
      const over = await setup()[name](good, { who: "over" });
      expect([over.status, await over.json()]).toEqual([401, { error: "unauthenticated" }]);
    },
  );

  it.each(ROUTES)("answers a body above the app's limit with 413 and echoes none of it, on %s", async (name) => {
    const t = setup();
    const response = await t[name](`${MARKER}${"x".repeat(BODY_LIMIT)}`, { who: "a" });
    expect(response.status).toBe(413);
    expect(await response.text()).not.toContain(MARKER);
    expect(t.lines.join("\n")).not.toContain(MARKER);
  });

  it("puts no byte of the paste in an Adena proof's signature or a code either", async () => {
    const t = setup({ script: { finish: "proof" } });
    const proof = { ...PROOF, signature: { ...PROOF.signature, signature: MARKER } };
    for (const body of [
      { nonce: NONCE, address: B, proof },
      { nonce: MARKER, address: B, proof },
    ]) {
      const response = await t.verify(body, { who: "a" });
      expect(await response.text()).not.toContain(MARKER);
    }
    expect(t.lines.join("\n")).not.toContain(MARKER);
  });

  it("logs a link with the acting account, the linked address and the way", async () => {
    const t = setup();
    await t.verify(verifyAdena, { who: "a" });
    expect(events(t, "link_made")).toMatchObject([{ account: hmac(A), subject: hmac(B), kind: "adena" }]);
  });

  it("logs an unlink with the acting account and the address", async () => {
    const t = setup();
    await t.unlink(unlinkB, { who: "a" });
    expect(events(t, "link_removed")).toMatchObject([{ account: hmac(A), subject: hmac(B) }]);
  });

  it("logs a refusal with its cause, the account and the address, while the answer holds the one word", async () => {
    const t = setup({ script: { finish: "proof" } });
    const response = await t.verify(verifyAdena, { who: "a" });
    expect(await response.json()).toEqual({ error: "refused" });
    expect(events(t, "link_refused")).toMatchObject([{ error: "proof", account: hmac(A), subject: hmac(B) }]);
  });

  it("logs no link when the links refuse, and no refusal when they accept", async () => {
    const [refused, accepted] = [setup({ script: { finish: "nonce" } }), setup()];
    await refused.verify(verifyAdena, { who: "a" });
    await accepted.verify(verifyAdena, { who: "a" });
    expect(events(refused, "link_made")).toEqual([]);
    expect(events(accepted, "link_refused")).toEqual([]);
  });
});

describe("the mutants of slice 13", () => {
  it.each(ROUTES)(
    "refuses a token with a session and no signing time, and one with a signing time and no session, on %s: nothing is asked of the links",
    async (name, good) => {
      for (const who of ["nosigned", "unseen"]) {
        const t = setup();
        const response = await t[name](good, { who });
        expect([response.status, await response.json()]).toEqual([401, { error: "unauthenticated" }]);
        expect([t.calls.start, t.calls.finish, t.calls.unlink]).toEqual([[], [], []]);
      }
    },
  );

  it("words a stale answer of the unlink as unauthenticated, as the other routes do, even when the session is fresh", async () => {
    const response = await setup({ script: { unlink: "stale" } }).unlink(unlinkB, { who: "a" });
    expect([response.status, await response.json()]).toEqual([401, { error: "unauthenticated" }]);
  });

  it("asks the worlds of the account alone when its list is empty, and of every member when it is not", async () => {
    const empty = setup({ script: { list: [] } });
    await empty.get({ who: "a" });
    expect((empty.calls.worlds[0] as [Address[], string])[0]).toEqual([A]);
    const joined = setup({
      script: {
        list: [
          { address: A, kind: "adena", linkedAt: T0 },
          { address: B, kind: "cli", linkedAt: T0 },
        ],
      },
    });
    const response = await joined.get({ who: "a" });
    expect((joined.calls.worlds[0] as [Address[], string])[0]).toEqual([A, B]);
    expect(await response.json()).toMatchObject({ linked: true });
  });
});

describe("with the real links, across the routes (part 4's red pass)", () => {
  const code = async (t: T, as: { who: string; address: Address; kind?: "cli" | "adena" }) => {
    const { who, address, kind = "cli" } = as;
    const response = await t.challenge({ kind, address }, { who });
    return z.object({ nonce: z.string(), memo: z.string().optional() }).parse(await response.json());
  };
  const linkKey = async (t: T, who: string) => {
    const key = cliKey();
    const made = await code(t, { who, address: key.address });
    const done = await t.verify(
      { nonce: made.nonce, address: key.address, file: cliFile(key, made.memo ?? "") },
      { who },
    );
    expect(done.status).toBe(200);
    return key;
  };

  it("lists a linked identity to every member and to nobody else, a free account's list empty, linked told", async () => {
    const t = setup({ real: true });
    const key = await linkKey(t, "a");
    const mine = z
      .object({ members: z.array(z.object({ address: z.string() })), linked: z.boolean() })
      .parse(await (await t.get({ who: "a" })).json());
    expect(mine.members.map(({ address }) => address).toSorted()).toEqual([A, key.address].toSorted());
    expect(mine.linked).toBe(true);
    const theirs = await (await t.get({ who: "c" })).json();
    expect(theirs).toMatchObject({ members: [], linked: false });
    expect(JSON.stringify(theirs)).not.toContain(A);
  });

  it("shares one limiter between the three POSTs: ten calls in all, not ten each", async () => {
    const t = setup({ real: true });
    for (const name of ["challenge", "verify", "unlink"] as const) {
      for (let i = 0; i < 3; i += 1)
        await t[name](name === "challenge" ? adena : name === "verify" ? verifyAdena : unlinkB, { who: "a" });
    }
    await t.challenge(adena, { who: "a" });
    expect((await t.unlink(unlinkB, { who: "a" })).status).toBe(429);
    expect((await t.verify(verifyAdena, { who: "a" })).status).toBe(429);
  });

  it("answers an unlink of a linked address, a free one and a non-member alike", async () => {
    const t = setup({ real: true });
    const key = await linkKey(t, "c");
    const outcomes: [number, string][] = [];
    for (const address of [key.address, cliKey().address, B]) {
      const response = await t.unlink({ address }, { who: "a", visitor: `203.0.113.${String(outcomes.length + 40)}` });
      outcomes.push([response.status, await response.text()]);
    }
    expect(new Set(outcomes.map((outcome) => outcome.join(" "))).size).toBe(1);
    expect(outcomes[0]?.[0]).toBe(404);
  });

  it("answers an Adena proof for an address linked elsewhere as for a free one (the refusal waits for the proof)", async () => {
    const t = setup({ real: true });
    const key = await linkKey(t, "a");
    const outcomes: [number, string][] = [];
    for (const address of [key.address, cliKey().address]) {
      const made = await code(t, { who: "c", address: address, kind: "adena" });
      const response = await t.verify(
        { nonce: made.nonce, address, proof: PROOF },
        { who: "c", visitor: `203.0.113.${String(outcomes.length + 60)}` },
      );
      outcomes.push([response.status, await response.text()]);
    }
    expect(outcomes[0]).toEqual(outcomes[1]);
  });

  it("unlinks a member, who then no longer appears in the list", async () => {
    const t = setup({ real: true });
    const key = await linkKey(t, "a");
    expect((await t.unlink({ address: key.address }, { who: "a" })).status).toBe(200);
    expect(await (await t.get({ who: "a" })).json()).toMatchObject({ members: [], linked: false });
  });
});

// D13940 (M2): a command-line key releases itself with no session. The same gates but the session: a listed Origin, JSON, strict bodies, a
// limit of their own per visitor and /64 and a cap of release codes pending in all; every answer the same for a linked and a free address.
describe("POST /api/links/release/challenge and /release/verify", () => {
  const challengeB = { address: B };
  const releaseB = { nonce: NONCE, address: B, file: "{}" };
  const RELEASES = [
    ["releaseChallenge", challengeB],
    ["releaseVerify", releaseB],
  ] as const;
  const events = (t: T, event: string) =>
    t.lines
      .map((line) => z.record(z.string(), z.unknown()).parse(JSON.parse(line)))
      .filter((line) => line["event"] === event);

  it("asks for a code for the address, with no session, by the host of the listed Origin, and answers the memo and the block", async () => {
    const t = setup();
    const response = await t.releaseChallenge(challengeB, { host: "evil.test" });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      nonce: NONCE,
      memo: CHALLENGE.text,
      block: `BLOCK ${B} ${CHALLENGE.text}`,
      expiresAt: CHALLENGE.expiresAt,
    });
    expect(t.calls.startRelease).toEqual([{ subject: B, host: "gnoworld.test" }]);
  });

  it("finishes with the code, the address, the pasted file as it is and the Origin's host, answering ok and nothing else", async () => {
    const t = setup();
    const response = await t.releaseVerify(releaseB, { host: "evil.test" });
    expect([response.status, await response.json()]).toEqual([200, { ok: true }]);
    expect(t.calls.finishRelease).toEqual([{ nonce: NONCE, address: B, file: "{}", host: "gnoworld.test" }]);
  });

  it.each(RELEASES)(
    "ignores the session: with one or without, the same call and the same answer, on %s",
    async (name, good) => {
      const [bare, held] = [setup(), setup()];
      const [one, two] = [await bare[name](good), await held[name](good, { who: "a" })];
      expect([one.status, await one.text()]).toEqual([two.status, await two.text()]);
      expect(JSON.stringify(held.calls)).not.toContain(A);
    },
  );

  it.each(RELEASES)(
    "refuses an Origin not listed, none, and a body that is not JSON, on %s, asking the links nothing",
    async (name, good) => {
      const t = setup();
      for (const [more, status, error] of [
        [{ origin: "https://evil.test" }, 403, "forbidden"],
        [{ origin: null }, 403, "forbidden"],
        [{ type: "text/plain" }, 415, "unsupported"],
      ] as const) {
        const response = await t[name](good, more);
        expect([response.status, await response.json()]).toEqual([status, { error }]);
      }
      expect([t.calls.startRelease, t.calls.finishRelease]).toEqual([[], []]);
    },
  );

  it.each([
    ["releaseChallenge", "a body with a kind", { ...challengeB, kind: "cli" }],
    ["releaseChallenge", "no address", {}],
    ["releaseChallenge", "an address that is no address", { address: "g1x" }],
    ["releaseVerify", "a proof in place of the file", { nonce: NONCE, address: B, proof: PROOF }],
    ["releaseVerify", "an extra key", { ...releaseB, by: A }],
    ["releaseVerify", "no file", { nonce: NONCE, address: B }],
    ["releaseVerify", "a code that is no code", { ...releaseB, nonce: "short" }],
    ["releaseVerify", "a file of 4097 bytes", { ...releaseB, file: "x".repeat(4097) }],
    ["releaseVerify", "a file of 2100 letters of two bytes", { ...releaseB, file: "é".repeat(2100) }],
  ] as const)("refuses, on %s, %s: 400 refused, nothing asked of the links", async (name, _, body) => {
    const t = setup();
    const response = await t[name](body);
    expect([response.status, await response.json()]).toEqual([400, { error: "refused" }]);
    expect([t.calls.startRelease, t.calls.finishRelease]).toEqual([[], []]);
  });

  it("accepts a file of exactly 4096 bytes", async () => {
    const t = setup();
    expect((await t.releaseVerify({ ...releaseB, file: "x".repeat(4096) })).status).toBe(200);
  });

  it.each(RELEASES)("answers a body above the app's limit with 413 and echoes none of it, on %s", async (name) => {
    const t = setup();
    const response = await t[name](`${MARKER}${"x".repeat(BODY_LIMIT)}`);
    expect(response.status).toBe(413);
    expect(await response.text()).not.toContain(MARKER);
    expect(t.lines.join("\n")).not.toContain(MARKER);
  });

  it("words the links' refusal of a text that cannot be signed offline as 400 refused, never a 500", async () => {
    const t = setup({ script: { startRelease: "text" } });
    const response = await t.releaseChallenge(challengeB);
    expect([response.status, await response.json()]).toEqual([400, { error: "refused" }]);
  });

  it.each([
    ["nonce", 404, "not_found"],
    ["proof", 400, "refused"],
  ] as const)("words the links' %s as %s %s", async (cause, status, error) => {
    const t = setup({ script: { finishRelease: cause } });
    const response = await t.releaseVerify(releaseB);
    expect([response.status, await response.json()]).toEqual([status, { error }]);
    expect(events(t, "link_released")).toEqual([]);
    expect(events(t, "link_refused")).toMatchObject([{ error: cause, subject: hmac(B) }]);
  });

  it("logs the release with the address as a hash and no account, once a row was dropped", async () => {
    const t = setup();
    await t.releaseVerify(releaseB);
    const [line] = events(t, "link_released");
    expect(line).toMatchObject({ subject: hmac(B) });
    expect(line).not.toHaveProperty("account");
    expect(t.lines.join("\n")).not.toContain(B);
  });

  it("answers 200 ok and logs no release when no row was dropped (a free address)", async () => {
    const t = setup({ script: { finishRelease: "none" } });
    const response = await t.releaseVerify(releaseB);
    expect([response.status, await response.json()]).toEqual([200, { ok: true }]);
    expect(events(t, "link_released")).toEqual([]);
    expect(events(t, "link_refused")).toEqual([]);
  });

  it("puts no byte of a refused paste in a log line or an error body, whatever fails", async () => {
    const file = JSON.stringify({ msg: [], note: MARKER });
    for (const script of [
      { finishRelease: "proof" },
      { finishRelease: "nonce" },
      { finishRelease: new Error(`bad ${file}`) },
    ] as const) {
      const t = setup({ script });
      const response = await t.releaseVerify({ nonce: NONCE, address: B, file });
      expect(await response.text()).not.toContain(MARKER);
      expect(t.lines.join("\n")).not.toContain(MARKER);
    }
  });

  // The challenge is made to refuse (`text`), so no code is issued and the /64's cap of codes stays out of what the call limit shows.
  it.each(RELEASES)(
    "has limits of its own: 10 calls a minute a visitor, apart from the link routes' and from the other release route, on %s",
    async (name, good) => {
      const t = setup({ script: { startRelease: "text" } });
      const first = name === "releaseChallenge" ? 400 : 200;
      for (let i = 0; i < 10; i += 1) expect((await t[name](good, { visitor: "203.0.113.5" })).status).toBe(first);
      const over = await t[name](good, { visitor: "203.0.113.5" });
      expect([over.status, await over.json()]).toEqual([429, { error: "too_many" }]);
      const other =
        name === "releaseChallenge"
          ? t.releaseVerify(releaseB, { visitor: "203.0.113.5" })
          : t.releaseChallenge(challengeB, { visitor: "203.0.113.5" });
      expect((await other).status).toBe(name === "releaseChallenge" ? 200 : 400);
      expect((await t.challenge(adena, { who: "a", visitor: "203.0.113.5" })).status).toBe(200);
      expect((await t[name](good, { visitor: "203.0.113.6" })).status).toBe(first);
      t.clock.now += 60_000;
      expect((await t[name](good, { visitor: "203.0.113.5" })).status).toBe(first);
    },
  );

  it("limits the link routes apart from the release's: ten calls to the release leave /challenge its own ten", async () => {
    const t = setup();
    for (let i = 0; i < 10; i += 1) await t.releaseVerify(releaseB, { visitor: "203.0.113.5" });
    expect((await t.challenge(adena, { who: "a", visitor: "203.0.113.5" })).status).toBe(200);
  });

  it("counts the call before the body is read: 11 malformed bodies from one visitor, the 11th is 429", async () => {
    const t = setup();
    for (let i = 0; i < 10; i += 1) expect((await t.releaseVerify("{not json")).status).toBe(400);
    expect((await t.releaseVerify("{not json")).status).toBe(429);
    const u = setup();
    for (let i = 0; i < 10; i += 1) expect((await u.releaseChallenge({})).status).toBe(400);
    expect((await u.releaseChallenge({})).status).toBe(429);
  });

  it.each(RELEASES)("counts a visitor by its /64, on %s", async (name, good) => {
    const t = setup();
    for (let i = 0; i < 10; i += 1) await t[name](good, { visitor: `2001:db8:1:2::${String(i + 1)}` });
    expect((await t[name](good, { visitor: "2001:db8:1:2::99" })).status).toBe(429);
    expect((await t[name](good, { visitor: "2001:db8:9:9::1" })).status).toBe(200);
  });

  it("caps the release codes issued from one /64 at 10 in 10 minutes, whatever the address, and frees them after", async () => {
    const t = setup();
    const near = (n: number) => `2001:db8:1:2::${String(n)}`;
    for (let i = 0; i < 10; i += 1) {
      t.clock.now += 20_000;
      expect((await t.releaseChallenge(challengeB, { visitor: near(i + 1) })).status).toBe(200);
    }
    t.clock.now += 20_000;
    const over = await t.releaseChallenge({ address: C }, { visitor: near(99) });
    expect([over.status, await over.json()]).toEqual([429, { error: "too_many" }]);
    expect((await t.releaseChallenge(challengeB, { visitor: "2001:db8:9:9::1" })).status).toBe(200);
    t.clock.now += 10 * MINUTE;
    expect((await t.releaseChallenge(challengeB, { visitor: near(99) })).status).toBe(200);
  });

  it("caps the release codes issued from one /48 at 20 in 10 minutes, whatever the /64, and frees them after", async () => {
    const t = setup();
    const inside = (net: number, n: number) => `2001:db8:1:${String(net)}::${String(n)}`;
    for (const net of [1, 2]) {
      for (let i = 0; i < 10; i += 1) {
        t.clock.now += 20_000;
        expect((await t.releaseChallenge(challengeB, { visitor: inside(net, i + 1) })).status).toBe(200);
      }
    }
    t.clock.now += 20_000;
    const over = await t.releaseChallenge(challengeB, { visitor: inside(3, 1) });
    expect([over.status, await over.json()]).toEqual([429, { error: "too_many" }]);
    expect((await t.releaseChallenge(challengeB, { visitor: "2001:db8:2:1::1" })).status).toBe(200);
    t.clock.now += 10 * MINUTE;
    expect((await t.releaseChallenge(challengeB, { visitor: inside(3, 1) })).status).toBe(200);
  });

  it("counts only the codes issued in the /48's cap: refused asks take nothing from it", async () => {
    const t = setup({ script: { startRelease: "text" } });
    for (let i = 0; i < 30; i += 1) {
      t.clock.now += 20_000;
      expect((await t.releaseChallenge(challengeB, { visitor: `2001:db8:1:${String(i)}::1` })).status).toBe(400);
    }
  });

  describe("with the real links", () => {
    const key = cliKey();
    const link = async (t: T, who: string, target: ReturnType<typeof cliKey>) => {
      const made = z
        .object({ nonce: z.string(), memo: z.string() })
        .parse(await (await t.challenge({ kind: "cli", address: target.address }, { who })).json());
      const done = await t.verify(
        { nonce: made.nonce, address: target.address, file: cliFile(target, made.memo) },
        { who },
      );
      expect(done.status).toBe(200);
    };
    const asked = async (t: T, target: ReturnType<typeof cliKey>, visitor = "203.0.113.50") => {
      const response = await t.releaseChallenge({ address: target.address }, { visitor });
      expect(response.status).toBe(200);
      return z.object({ nonce: z.string(), memo: z.string(), block: z.string() }).parse(await response.json());
    };

    it("writes no row when a code is asked for, a linked key's or a free one's", async () => {
      const t = setup({ real: true });
      await link(t, "a", key);
      const before = Number(t.db?.prepare("SELECT count(*) AS n FROM nonces").get()?.["n"]);
      await asked(t, key);
      await asked(t, cliKey(), "203.0.113.51");
      expect(Number(t.db?.prepare("SELECT count(*) AS n FROM nonces").get()?.["n"])).toBe(before);
      expect(Number(t.db?.prepare("SELECT count(*) AS n FROM release_spent").get()?.["n"])).toBe(0);
    });

    it("releases a linked key that signs the memo with no session: its row goes, the account keeps only itself", async () => {
      const t = setup({ real: true });
      await link(t, "a", key);
      const code = await asked(t, key);
      expect(code.memo).toBe(`Unlink ${key.address} from its gnoworld identity on gnoworld.test. Code ${code.nonce}`);
      const response = await t.releaseVerify({
        nonce: code.nonce,
        address: key.address,
        file: cliFile(key, code.memo),
      });
      expect([response.status, await response.json()]).toEqual([200, { ok: true }]);
      expect(await (await t.get({ who: "a" })).json()).toMatchObject({ members: [], linked: false });
      expect(events(t, "link_released")).toMatchObject([{ subject: hmac(key.address) }]);
    });

    it("answers a linked key and a free one alike, at the code and at the proof, bytes for bytes but the address and the code", async () => {
      const t = setup({ real: true });
      const [linked, free] = [cliKey(), cliKey()];
      await link(t, "a", linked);
      const out: string[][] = [];
      for (const [i, target] of [linked, free].entries()) {
        const visitor = `203.0.113.${String(60 + i)}`;
        const code = await asked(t, target, visitor);
        const good = await t.releaseVerify(
          { nonce: code.nonce, address: target.address, file: cliFile(target, code.memo) },
          { visitor },
        );
        const again = await t.releaseVerify(
          { nonce: code.nonce, address: target.address, file: cliFile(target, code.memo) },
          { visitor },
        );
        const wrong = await asked(t, target, visitor);
        const bad = await t.releaseVerify(
          { nonce: wrong.nonce, address: target.address, file: cliFile(cliKey(), wrong.memo) },
          { visitor },
        );
        out.push([
          String(good.status),
          await good.text(),
          String(again.status),
          await again.text(),
          String(bad.status),
          await bad.text(),
        ]);
      }
      expect(out[0]).toEqual(out[1]);
      expect(out[0]?.slice(0, 2)).toEqual(["200", '{"ok":true}']);
    });

    it("logs a release for a linked key alone, never for a free one, and the raw address in no line", async () => {
      const t = setup({ real: true });
      const [linked, free] = [cliKey(), cliKey()];
      await link(t, "a", linked);
      for (const target of [free, linked]) {
        const code = await asked(t, target);
        await t.releaseVerify({ nonce: code.nonce, address: target.address, file: cliFile(target, code.memo) });
      }
      expect(events(t, "link_released")).toMatchObject([{ subject: hmac(linked.address) }]);
      expect(events(t, "link_released")).toHaveLength(1);
      for (const address of [linked.address, free.address]) expect(t.lines.join("\n")).not.toContain(address);
    });

    it.each([
      ["the unsigned document", (code: { memo: string }) => cliDocument(key.address, code.memo).document],
      ["an empty paste", () => ""],
      ["text that is no JSON", () => "gnokey: not a tx"],
      ["a signed file cut short", (code: { memo: string }) => cliFile(key, code.memo).slice(0, 120)],
    ])(
      "refuses %s with 400, echoes nothing of the paste, leaves the key linked and the code to its holder",
      async (_, paste) => {
        const t = setup({ real: true });
        await link(t, "a", key);
        const code = await asked(t, key);
        const response = await t.releaseVerify({ nonce: code.nonce, address: key.address, file: paste(code) });
        expect([response.status, await response.json()]).toEqual([400, { error: "refused" }]);
        expect(await (await t.get({ who: "a" })).json()).toMatchObject({ linked: true });
        const good = { nonce: code.nonce, address: key.address, file: cliFile(key, code.memo) };
        expect((await t.releaseVerify(good)).status).toBe(200);
        expect(await (await t.get({ who: "a" })).json()).toMatchObject({ linked: false });
      },
    );

    it("puts no byte of a valid paste in a log line, whatever the key's file carries (a pasted memo is ignored)", async () => {
      const t = setup({ real: true });
      await link(t, "a", key);
      const code = await asked(t, key);
      const file = cliFile(key, code.memo, { pastedMemo: MARKER });
      const response = await t.releaseVerify({ nonce: code.nonce, address: key.address, file });
      expect(response.status).toBe(200);
      expect(t.lines.join("\n")).not.toContain(MARKER);
      expect(await response.text()).not.toContain(MARKER);
    });

    it("finishes no release with an Adena link code, nor a link with a release code of the adena kind", async () => {
      const t = setup({ real: true });
      const made = z
        .object({ nonce: z.string(), text: z.string() })
        .parse(await (await t.challenge({ kind: "adena", address: key.address }, { who: "a" })).json());
      const response = await t.releaseVerify({
        nonce: made.nonce,
        address: key.address,
        file: cliFile(key, made.text),
      });
      expect(response.status).toBe(404);
    });

    it("releases nothing for a file signed by another key, which burns no code: the key's own file still works, once", async () => {
      const t = setup({ real: true });
      await link(t, "a", key);
      const code = await asked(t, key);
      const stolen = { nonce: code.nonce, address: key.address, file: cliFile(cliKey(), code.memo) };
      expect([(await t.releaseVerify(stolen)).status, (await t.releaseVerify(stolen)).status]).toEqual([400, 400]);
      expect(await (await t.get({ who: "a" })).json()).toMatchObject({ linked: true });
      const good = { nonce: code.nonce, address: key.address, file: cliFile(key, code.memo) };
      expect((await t.releaseVerify(good)).status).toBe(200);
      expect((await t.releaseVerify(good)).status).toBe(404);
      expect(await (await t.get({ who: "a" })).json()).toMatchObject({ linked: false });
    });

    it("lets a link's code and a link's file release nothing, and a release's code link nothing", async () => {
      const t = setup({ real: true });
      const made = z
        .object({ nonce: z.string(), memo: z.string() })
        .parse(await (await t.challenge({ kind: "cli", address: key.address }, { who: "a" })).json());
      const asLink = { nonce: made.nonce, address: key.address, file: cliFile(key, made.memo) };
      expect((await t.releaseVerify(asLink)).status).toBe(404);
      const code = await asked(t, key);
      expect(
        (await t.verify({ nonce: code.nonce, address: key.address, file: cliFile(key, code.memo) }, { who: "a" }))
          .status,
      ).toBe(404);
      expect(await (await t.get({ who: "a" })).json()).toMatchObject({ members: [] });
    });
  });
});
