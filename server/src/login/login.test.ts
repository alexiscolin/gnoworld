import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { MAX_ARBITRARY_MESSAGE_BYTES } from "@adena-wallet/sdk";
import { Address, type Proof } from "@gnoworld/schemas";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { openDatabase } from "../db.ts";
import { wallet, type Wallet } from "../testing/signer.ts";
import {
  LOGIN_TABLES,
  makeLogin,
  makeSigned,
  NONCE_ACTION,
  NONCE_HOST,
  verifyProof,
  type Login,
  type Verify,
} from "./login.ts";
import { TICKET_TABLES } from "./ticket.ts";

const T0 = Date.parse("2026-10-22T12:00:00.000Z");
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const TTL = 5 * MINUTE;
const DOMAIN = "gnoworld.test";
const CHAINS = ["onyx-1", "gnoland-1"];
const OTHER = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");

const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

const setup = (options: { verify?: Verify; nonceCap?: number } = {}) => {
  const db = openDatabase(":memory:", [LOGIN_TABLES, NONCE_HOST, NONCE_ACTION]);
  opened.push(db);
  const clock = { now: T0 };
  const login = makeLogin(db, { chains: CHAINS, now: () => clock.now, ...options });
  return { db, clock, login };
};

const challenge = (login: Login, chainId = "onyx-1") => {
  const made = login.challenge(chainId, DOMAIN);
  if (typeof made === "string") throw new Error(`no challenge: ${made}`);
  return made;
};

const anyone = (): boolean => true;

describe("the nonces' table", () => {
  it("takes the host column at the next start of a file made before it, which the image before still writes", () => {
    const folder = mkdtempSync(join(tmpdir(), "gnoworld-nonces-"));
    try {
      const file = join(folder, "gnoworld.sqlite");
      // As 3c and 3d made it: their migrations, in their order.
      openDatabase(file, [LOGIN_TABLES, TICKET_TABLES]).close();
      const db = openDatabase(file, [LOGIN_TABLES, TICKET_TABLES, NONCE_HOST, NONCE_ACTION]);
      try {
        const login = makeLogin(db, { chains: CHAINS, now: () => T0 });
        expect(typeof login.challenge("onyx-1", DOMAIN)).toBe("object");
        // The image before inserts without the host, and its nonce is no other host's.
        db.prepare("INSERT INTO nonces (nonce, chain, text, expires_at) VALUES ('old', 'onyx-1', 't', ?)").run(
          T0 + TTL,
        );
        expect(db.prepare("SELECT host FROM nonces WHERE nonce = 'old'").get()).toEqual({ host: "" });
      } finally {
        db.close();
      }
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});

describe("challenge", () => {
  it("writes the whole text the wallet signs: the version, the domain, the nonce, issue and expiry", () => {
    const { login } = setup();
    const made = challenge(login);
    expect(made.nonce).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(made.expiresAt).toBe("2026-10-22T12:05:00.000Z");
    expect(made.text).toBe(
      [
        "Sign in to gnoworld (login, version 1)",
        "",
        `Domain: ${DOMAIN}`,
        `Nonce: ${made.nonce}`,
        "Issued: 2026-10-22T12:00:00.000Z",
        "Expires: 2026-10-22T12:05:00.000Z",
      ].join("\n"),
    );
  });

  it("keeps the text under the SDK's limit with the longest domain a host can have", () => {
    const { login } = setup();
    const made = login.challenge("onyx-1", `${"a".repeat(253)}:65535`);
    if (typeof made === "string") throw new Error(made);
    expect(Buffer.byteLength(made.text)).toBeLessThanOrEqual(MAX_ARBITRARY_MESSAGE_BYTES);
  });

  it("stores the very text and chain it returns, with its nonce", () => {
    const { db, login } = setup();
    const made = challenge(login, "gnoland-1");
    expect(db.prepare("SELECT chain, text FROM nonces WHERE nonce = ?").get(made.nonce)).toEqual({
      chain: "gnoland-1",
      text: made.text,
    });
  });

  it("takes each chain of the list and refuses any other, storing nothing", () => {
    const { db, login } = setup();
    for (const chainId of CHAINS) expect(typeof login.challenge(chainId, DOMAIN)).toBe("object");
    for (const chainId of ["test5", "ONYX-1", "onyx-1 ", "", "gnoland-1\n"]) {
      expect(login.challenge(chainId, DOMAIN)).toBe("chain");
    }
    expect(db.prepare("SELECT count(*) AS n FROM nonces").get()).toEqual({ n: 2 });
  });

  it("gives every challenge its own nonce", () => {
    const { login } = setup();
    const nonces = new Set(Array.from({ length: 1000 }, () => challenge(login).nonce));
    expect(nonces.size).toBe(1000);
  });

  it("refuses a challenge past the cap on unspent nonces, and takes one again once they expire", () => {
    const { clock, login } = setup({ nonceCap: 3 });
    for (let i = 0; i < 3; i++) challenge(login);
    expect(login.challenge("onyx-1", DOMAIN)).toBe("full");
    clock.now += TTL;
    expect(typeof login.challenge("onyx-1", DOMAIN)).toBe("object");
  });

  it("holds 100,000 unspent nonces at most, by default", () => {
    const { db, login } = setup();
    const insert = db.prepare(
      "INSERT INTO nonces (nonce, chain, host, text, expires_at) VALUES (?, 'onyx-1', ?, '', ?)",
    );
    db.exec("BEGIN");
    for (let i = 0; i < 99_999; i++) insert.run(`n${String(i)}`, DOMAIN, T0 + TTL);
    db.exec("COMMIT");
    expect(typeof login.challenge("onyx-1", DOMAIN)).toBe("object");
    expect(login.challenge("onyx-1", DOMAIN)).toBe("full");
  });

  it("purges the expired nonces when it writes a new one, and keeps the live ones verifiable", async () => {
    const { db, clock, login } = setup();
    for (let i = 0; i < 5; i++) challenge(login);
    clock.now += TTL - 1;
    const live = challenge(login);
    clock.now += 1;
    challenge(login);
    expect(db.prepare("SELECT count(*) AS n FROM nonces").get()).toEqual({ n: 2 });
    const me = wallet();
    expect(
      typeof (await login.verify(
        { nonce: live.nonce, address: me.address, proof: me.sign("onyx-1", live.text) },
        anyone,
        DOMAIN,
      )),
    ).toBe("object");
  });

  it("refuses to start with no chain to log in on", () => {
    expect(() =>
      makeLogin(openDatabase(":memory:", [LOGIN_TABLES, NONCE_HOST]), { chains: [], now: () => T0 }),
    ).toThrow(/^the login needs at least one chain$/);
  });
});

describe("verify, with the SDK's verifier", () => {
  it("turns a valid proof into a token of 256 bits, of which only the SHA-256 is stored", async () => {
    const { db, login } = setup();
    const me = wallet();
    const made = challenge(login);
    const result = await login.verify(
      { nonce: made.nonce, address: me.address, proof: me.sign("onyx-1", made.text) },
      anyone,
      DOMAIN,
    );
    if (typeof result === "string") throw new Error(result);
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.maxAge).toBe(90 * 24 * 60 * 60);
    const stored = db.prepare("SELECT hex(hash) AS hash, address FROM tokens").all();
    const sha = createHash("sha256").update(result.token).digest("hex").toUpperCase();
    expect(stored).toEqual([{ hash: sha, address: me.address }]);
    const everything = JSON.stringify(
      ["nonces", "accounts", "tokens"].map((table) => db.prepare(`SELECT * FROM ${table}`).all()),
    );
    expect(everything).not.toContain(result.token);
  });

  it.each([
    ["onyx-1", "gnoland-1"],
    ["gnoland-1", "onyx-1"],
  ])("refuses a proof made for %s against a %s challenge", async (signedFor, asked) => {
    const { login } = setup();
    const me = wallet();
    const made = challenge(login, asked);
    expect(
      await login.verify(
        { nonce: made.nonce, address: me.address, proof: me.sign(signedFor, made.text) },
        anyone,
        DOMAIN,
      ),
    ).toBe("proof");
  });

  const otherKey = wallet();
  type Doc = Parameters<Wallet["signDoc"]>[0];
  // The SDK types a document's messages as any: read them as the canonical one writes them.
  const Messages = z.array(z.object({ type: z.string(), value: z.object({ signer: z.string(), data: z.string() }) }));
  type Messages = z.infer<typeof Messages>;
  const changed =
    (change: (doc: Doc, msgs: Messages) => Doc) =>
    (text: string, me: Wallet): [Address, Proof] => {
      const doc = me.sign("onyx-1", text).signed;
      return [me.address, me.signDoc(change(doc, Messages.parse(doc.msgs)))];
    };
  const vectors: [string, (text: string, me: ReturnType<typeof wallet>) => [Address, Proof]][] = [
    [
      "signed by another key for the same address",
      (text, me) => [me.address, otherKey.sign("onyx-1", text, me.address)],
    ],
    ["signed by another account entirely", (text, me) => [me.address, otherKey.sign("onyx-1", text)]],
    ["a text with one byte changed", (text, me) => [me.address, me.sign("onyx-1", text.replace("Nonce:", "Nonce;"))]],
    ["a text with a byte added", (text, me) => [me.address, me.sign("onyx-1", `${text} `)]],
    ["a proof for another address than the one named", (text, me) => [OTHER, me.sign("onyx-1", text)]],
    // A gno session key signs a transaction for its master account (tm2/pkg/sdk/auth/ante.go,
    // SessionAddr); a login proof has no such field, so its key can only stand for itself.
    ["a session key signing for its master account", (text) => [OTHER, otherKey.sign("onyx-1", text, OTHER)]],
    [
      "a key of another type, a multisig's",
      (text, me) => [me.address, retyped(me.sign("onyx-1", text), "/tm.PubKeyMultisig")],
    ],
    ["an empty signature", (text, me) => [me.address, resigned(me.sign("onyx-1", text), "")]],
    ["a truncated signature", (text, me) => [me.address, resigned(me.sign("onyx-1", text), (s) => s.subarray(0, 63))]],
    [
      "an oversize signature",
      (text, me) => [me.address, resigned(me.sign("onyx-1", text), (s) => Buffer.concat([s, Buffer.from([0])]))],
    ],
    ["a high-S twin of a valid signature", (text, me) => [me.address, resigned(me.sign("onyx-1", text), highS)]],
    // The key itself signs a document that is not the canonical one: only the verifier's comparison refuses it.
    ["a document with a memo", changed((doc) => ({ ...doc, memo: "x" }))],
    [
      "a document with a fee",
      changed((doc) => ({ ...doc, fee: { amount: [{ denom: "ugnot", amount: "1" }], gas: "0" } })),
    ],
    ["a document with gas", changed((doc) => ({ ...doc, fee: { ...doc.fee, gas: "1" } }))],
    ["a document with an account number", changed((doc) => ({ ...doc, account_number: "1" }))],
    ["a document with a sequence", changed((doc) => ({ ...doc, sequence: "1" }))],
    ["a document with a second message", changed((doc, msgs) => ({ ...doc, msgs: [...msgs, ...msgs] }))],
    [
      "a document whose message is of another type",
      changed((doc, msgs) => ({ ...doc, msgs: msgs.map((msg) => ({ ...msg, type: "/bank.MsgSend" })) })),
    ],
  ];

  it.each(vectors)("refuses %s, and spends the nonce", async (_, forge) => {
    const { login } = setup();
    const me = wallet();
    const made = challenge(login);
    const [address, proof] = forge(made.text, me);
    expect(await login.verify({ nonce: made.nonce, address: address, proof }, anyone, DOMAIN)).toBe("proof");
    expect(
      await login.verify(
        { nonce: made.nonce, address: me.address, proof: me.sign("onyx-1", made.text) },
        anyone,
        DOMAIN,
      ),
    ).toBe("nonce");
  });

  it("logs in with the canonical document signed whole, so each changed one fails for its change alone", async () => {
    const { login } = setup();
    const me = wallet();
    const made = challenge(login);
    const proof = me.signDoc(me.sign("onyx-1", made.text).signed);
    expect(await login.verify({ nonce: made.nonce, address: me.address, proof }, anyone, DOMAIN)).toHaveProperty(
      "token",
    );
  });

  it("refuses the same proof sent twice in a row", async () => {
    const { login } = setup();
    const me = wallet();
    const made = challenge(login);
    const proof = me.sign("onyx-1", made.text);
    expect(typeof (await login.verify({ nonce: made.nonce, address: me.address, proof }, anyone, DOMAIN))).toBe(
      "object",
    );
    expect(await login.verify({ nonce: made.nonce, address: me.address, proof }, anyone, DOMAIN)).toBe("nonce");
  });

  it("refuses an unknown nonce, one that only looks like a known one, and a nonce of another challenge", async () => {
    const { login } = setup();
    const me = wallet();
    const [first, second] = [challenge(login), challenge(login)];
    const proof = me.sign("onyx-1", first.text);
    for (const unknown of [
      "A".repeat(22),
      "_".repeat(22),
      "%",
      first.nonce.toUpperCase(),
      first.nonce.toLowerCase(),
      ` ${first.nonce}`,
    ]) {
      if (unknown !== first.nonce)
        expect(await login.verify({ nonce: unknown, address: me.address, proof }, anyone, DOMAIN)).toBe("nonce");
    }
    expect(await login.verify({ nonce: second.nonce, address: me.address, proof }, anyone, DOMAIN)).toBe("proof");
    expect(typeof (await login.verify({ nonce: first.nonce, address: me.address, proof }, anyone, DOMAIN))).toBe(
      "object",
    );
  });

  it("hands out a new token at each login, the same account at the same instant included", async () => {
    const { login } = setup();
    const me = wallet();
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const made = challenge(login);
      const result = await login.verify(
        { nonce: made.nonce, address: me.address, proof: me.sign("onyx-1", made.text) },
        anyone,
        DOMAIN,
      );
      if (typeof result !== "string") tokens.add(result.token);
    }
    expect(tokens.size).toBe(100);
  });

  it.each([
    [TTL - 1, "object"],
    [TTL, "nonce"],
    [TTL + 1, "nonce"],
  ])("at %i ms after the challenge, answers a valid proof with %s", async (after, expected) => {
    const { clock, login } = setup();
    const me = wallet();
    const made = challenge(login);
    clock.now += after;
    const result = await login.verify(
      { nonce: made.nonce, address: me.address, proof: me.sign("onyx-1", made.text) },
      anyone,
      DOMAIN,
    );
    expect(typeof result === "string" ? result : typeof result).toBe(expected);
  });
});

describe("verify, with a verifier the test holds", () => {
  it("hands the verifier the stored text and chain and the address named, never the client's document", async () => {
    const seen: Parameters<Verify>[1][] = [];
    const { login } = setup({
      verify: (_, expected) => {
        seen.push(expected);
        return Promise.resolve(true);
      },
    });
    const me = wallet();
    const made = challenge(login, "gnoland-1");
    await login.verify(
      { nonce: made.nonce, address: me.address, proof: me.sign("onyx-1", "another text") },
      anyone,
      DOMAIN,
    );
    expect(seen).toEqual([{ signer: me.address, chainId: "gnoland-1", data: made.text }]);
  });

  it.each([2, 50])(
    "logs in exactly once, verifying once, when the same proof arrives %i times at once",
    async (times) => {
      let calls = 0;
      const { db, login } = setup({
        verify: () => {
          calls += 1;
          return new Promise((resolve) =>
            setImmediate(() => {
              resolve(true);
            }),
          );
        },
      });
      const me = wallet();
      const made = challenge(login);
      const proof = me.sign("onyx-1", made.text);
      const results = await Promise.all(
        Array.from({ length: times }, () =>
          login.verify({ nonce: made.nonce, address: me.address, proof }, anyone, DOMAIN),
        ),
      );
      expect(results.filter((result) => typeof result === "object")).toHaveLength(1);
      expect(results.filter((result) => result === "nonce")).toHaveLength(times - 1);
      expect(calls).toBe(1);
      expect(db.prepare("SELECT count(*) AS n FROM tokens").get()).toEqual({ n: 1 });
    },
  );

  it("never calls the verifier for an unknown, expired or spent nonce", async () => {
    let calls = 0;
    const { clock, login } = setup({
      verify: () => {
        calls += 1;
        return Promise.resolve(true);
      },
    });
    const me = wallet();
    const [spent, expired] = [challenge(login), challenge(login)];
    await login.verify(
      { nonce: spent.nonce, address: me.address, proof: me.sign("onyx-1", spent.text) },
      anyone,
      DOMAIN,
    );
    calls = 0;
    await login.verify(
      { nonce: spent.nonce, address: me.address, proof: me.sign("onyx-1", spent.text) },
      anyone,
      DOMAIN,
    );
    await login.verify(
      { nonce: "A".repeat(22), address: me.address, proof: me.sign("onyx-1", spent.text) },
      anyone,
      DOMAIN,
    );
    clock.now += TTL;
    await login.verify(
      { nonce: expired.nonce, address: me.address, proof: me.sign("onyx-1", expired.text) },
      anyone,
      DOMAIN,
    );
    expect(calls).toBe(0);
  });

  it.each([
    [
      "throws",
      (): Promise<boolean> => {
        throw new Error("verifier broke");
      },
    ],
    ["rejects", (): Promise<boolean> => Promise.reject(new Error("verifier broke"))],
  ])("refuses the proof when the verifier %s, and makes no account or token", async (_, verify) => {
    const { db, login } = setup({ verify });
    const me = wallet();
    const made = challenge(login);
    expect(
      await login.verify(
        { nonce: made.nonce, address: me.address, proof: me.sign("onyx-1", made.text) },
        anyone,
        DOMAIN,
      ),
    ).toBe("proof");
    expect([
      db.prepare("SELECT count(*) AS n FROM accounts").get(),
      db.prepare("SELECT count(*) AS n FROM tokens").get(),
    ]).toEqual([{ n: 0 }, { n: 0 }]);
  });

  it("spends the nonce before verifying, so a refused proof buys no second try", async () => {
    let answer = false;
    const { login } = setup({ verify: () => Promise.resolve(answer) });
    const me = wallet();
    const made = challenge(login);
    expect(
      await login.verify(
        { nonce: made.nonce, address: me.address, proof: me.sign("onyx-1", made.text) },
        anyone,
        DOMAIN,
      ),
    ).toBe("proof");
    answer = true;
    expect(
      await login.verify(
        { nonce: made.nonce, address: me.address, proof: me.sign("onyx-1", made.text) },
        anyone,
        DOMAIN,
      ),
    ).toBe("nonce");
  });
});

describe("accounts", () => {
  const login1 = async (login: Login, me = wallet(), mayCreate = anyone) => {
    const made = challenge(login);
    return {
      me,
      result: await login.verify(
        { nonce: made.nonce, address: me.address, proof: me.sign("onyx-1", made.text) },
        mayCreate,
        DOMAIN,
      ),
    };
  };

  it("creates the account at its first verified login, and keeps its first day after", async () => {
    const { db, clock, login } = setup();
    const { me } = await login1(login);
    clock.now += DAY;
    await login1(login, me);
    expect(db.prepare("SELECT address, first_seen FROM accounts").all()).toEqual([
      { address: me.address, first_seen: T0 },
    ]);
  });

  it("asks before creating an account, and refuses when the limit says no", async () => {
    const { db, login } = setup();
    expect((await login1(login, wallet(), () => false)).result).toBe("new_account");
    expect(db.prepare("SELECT count(*) AS n FROM accounts").get()).toEqual({ n: 0 });
    expect(db.prepare("SELECT count(*) AS n FROM tokens").get()).toEqual({ n: 0 });
  });

  it("creates one account, asking once, when a new address logs in twice at once", async () => {
    const { db, login } = setup({
      verify: () =>
        new Promise((resolve) =>
          setImmediate(() => {
            resolve(true);
          }),
        ),
    });
    const me = wallet();
    const [first, second] = [challenge(login), challenge(login)];
    let asked = 0;
    const mayCreate = (): boolean => {
      asked += 1;
      return true;
    };
    const results = await Promise.all(
      [first, second].map((made) =>
        login.verify(
          { nonce: made.nonce, address: me.address, proof: me.sign("onyx-1", made.text) },
          mayCreate,
          DOMAIN,
        ),
      ),
    );
    expect(results.map((result) => typeof result)).toEqual(["object", "object"]);
    expect([asked, db.prepare("SELECT count(*) AS n FROM accounts").get()]).toEqual([1, { n: 1 }]);
  });

  it("never asks for a forged proof", async () => {
    const { login } = setup();
    const me = wallet();
    const made = challenge(login);
    let asked = 0;
    const result = await login.verify(
      { nonce: made.nonce, address: me.address, proof: wallet().sign("onyx-1", made.text, me.address) },
      () => {
        asked += 1;
        return true;
      },
      DOMAIN,
    );
    expect([result, asked]).toEqual(["proof", 0]);
  });

  it("never asks for an account that exists", async () => {
    const { login } = setup();
    const { me } = await login1(login);
    let asked = 0;
    const { result } = await login1(login, me, () => {
      asked += 1;
      return false;
    });
    expect([typeof result, asked]).toEqual(["object", 0]);
  });
});

describe("the token", () => {
  const token = async (login: Login): Promise<{ token: string; address: Address }> => {
    const me = wallet();
    const made = challenge(login);
    const result = await login.verify(
      { nonce: made.nonce, address: me.address, proof: me.sign("onyx-1", made.text) },
      anyone,
      DOMAIN,
    );
    if (typeof result === "string") throw new Error(result);
    return { token: result.token, address: me.address };
  };

  it.each([
    [30 * DAY - MINUTE, true],
    [30 * DAY, false],
  ])("unused for %i ms, holds: %s", async (after, holds) => {
    const { clock, login } = setup();
    const made = await token(login);
    clock.now += after;
    expect(login.session(made.token)).toBe(holds ? made.address : undefined);
  });

  it("renews on use for 30 days, and ends 90 days after its signature whatever the use", async () => {
    const { clock, login } = setup();
    const made = await token(login);
    for (const day of [29, 58, 87, 89]) {
      clock.now = T0 + day * DAY;
      expect(login.session(made.token)).toBe(made.address);
    }
    clock.now = T0 + 90 * DAY - 1;
    expect(login.session(made.token)).toBe(made.address);
    clock.now = T0 + 90 * DAY;
    expect(login.session(made.token)).toBeUndefined();
  });

  it("counts the 90 days from the token's own login, not from the account's first", async () => {
    const { clock, login } = setup();
    const me = wallet();
    const once = async () => {
      const made = challenge(login);
      const result = await login.verify(
        { nonce: made.nonce, address: me.address, proof: me.sign("onyx-1", made.text) },
        anyone,
        DOMAIN,
      );
      if (typeof result === "string") throw new Error(result);
      return result.token;
    };
    await once();
    clock.now = T0 + 100 * DAY;
    const later = await once();
    expect(login.session(later)).toBe(me.address);
    for (const day of [129, 158, 187]) {
      clock.now = T0 + day * DAY;
      expect(login.session(later)).toBe(me.address);
    }
  });

  it("knows no unknown or malformed token", async () => {
    const { login } = setup();
    const made = await token(login);
    for (const other of ["", "x", made.token.slice(1), `${made.token}A`, made.token.toUpperCase(), "A".repeat(43)]) {
      if (other !== made.token) expect(login.session(other)).toBeUndefined();
    }
  });

  it("knows no session and ends nothing without a token", async () => {
    const { login } = setup();
    const made = await token(login);
    login.logout(undefined);
    expect([login.session(undefined), login.session(made.token)]).toEqual([undefined, made.address]);
  });

  it("ends at logout, and a logout of an unknown token changes nothing", async () => {
    const { db, login } = setup();
    const [kept, ended] = [await token(login), await token(login)];
    login.logout("A".repeat(43));
    login.logout(ended.token);
    expect(login.session(ended.token)).toBeUndefined();
    expect(login.session(kept.token)).toBe(kept.address);
    expect(db.prepare("SELECT count(*) AS n FROM tokens").get()).toEqual({ n: 1 });
  });

  it.each([MINUTE, 0])(
    "keeps an account's 10 newest tokens, %i ms apart: its 11th login ends the oldest, no other account's",
    async (apart) => {
      const { db, clock, login } = setup();
      const other = await token(login);
      const me = wallet();
      const tokens: string[] = [];
      for (let n = 0; n < 11; n += 1) {
        clock.now += apart;
        const made = challenge(login);
        const proof = me.sign("onyx-1", made.text);
        const result = await login.verify({ nonce: made.nonce, address: me.address, proof }, anyone, DOMAIN);
        if (typeof result === "string") throw new Error(result);
        tokens.push(result.token);
      }
      expect(db.prepare("SELECT count(*) AS n FROM tokens WHERE address = ?").get(me.address)).toEqual({ n: 10 });
      expect(tokens.map((made) => login.session(made))).toEqual([
        undefined,
        ...Array.from({ length: 10 }, () => me.address),
      ]);
      expect(login.session(other.token)).toBe(other.address);
    },
  );

  it("writes a renewal at most once a minute, so a stream of uses costs one write a minute", async () => {
    const { db, clock, login } = setup();
    const made = await token(login);
    const expiry = (): unknown => db.prepare("SELECT expires_at AS at FROM tokens").get();
    clock.now = T0 + MINUTE - 1;
    expect(login.session(made.token)).toBe(made.address);
    expect(expiry()).toEqual({ at: T0 + 30 * DAY });
    clock.now = T0 + MINUTE;
    expect(login.session(made.token)).toBe(made.address);
    expect(expiry()).toEqual({ at: T0 + MINUTE + 30 * DAY });
    clock.now = T0 + 2 * MINUTE - 1;
    expect(login.session(made.token)).toBe(made.address);
    expect(expiry()).toEqual({ at: T0 + MINUTE + 30 * DAY });
  });

  it("counts each token's minute apart: another token's write does not hold this one's back", async () => {
    const { db, clock, login } = setup();
    const [a, b] = [await token(login), await token(login)];
    const expiry = (address: Address): unknown =>
      db.prepare("SELECT expires_at AS at FROM tokens WHERE address = ?").get(address);
    clock.now = T0 + MINUTE;
    login.session(a.token);
    clock.now = T0 + MINUTE + 1;
    login.session(b.token);
    expect([expiry(a.address), expiry(b.address)]).toEqual([
      { at: T0 + MINUTE + 30 * DAY },
      { at: T0 + MINUTE + 1 + 30 * DAY },
    ]);
  });

  it("purges the ended tokens at the next login, and only those", async () => {
    const { db, clock, login } = setup();
    const ended = await token(login);
    clock.now += DAY;
    const live = await token(login);
    clock.now = T0 + 30 * DAY;
    const fresh = await token(login);
    expect(db.prepare("SELECT count(*) AS n FROM tokens").get()).toEqual({ n: 2 });
    expect([login.session(ended.token), login.session(live.token), login.session(fresh.token)]).toEqual([
      undefined,
      live.address,
      fresh.address,
    ]);
  });
});

describe("verifyProof", () => {
  it("still takes a proof made once and written out, so a new SDK that signs other bytes shows here", async () => {
    // Made by testing/signer.ts on 2026-10-22, with SDK 0.1.1; the document is ADR-036's, by hand.
    const text = [
      "Sign in to gnoworld (login, version 1)",
      "",
      "Domain: gnoworld.test",
      "Nonce: frozen-nonce-0000000000",
      "Issued: 2026-10-22T12:00:00.000Z",
      "Expires: 2026-10-22T12:05:00.000Z",
    ].join("\n");
    const signer = Address.parse("g1pplvlanvvpecuk0ukgm4g4yltwh6cy6nfq3y4l");
    const proof: Proof = {
      signed: {
        chain_id: "onyx-1",
        account_number: "0",
        sequence: "0",
        fee: { amount: [], gas: "0" },
        msgs: [{ type: "sign/MsgSignData", value: { signer, data: Buffer.from(text).toString("base64") } }],
        memo: "",
      },
      signature: {
        pubKey: { typeUrl: "/tm.PubKeySecp256k1", value: "A5cbN2zkrMoLSiHVLBm6AXMee38EmGSLE7tYgWNGkeie" },
        signature: "bCiZXX6h3CiLOX4pS57TKCyfklV/SERtLXJVlDKj6Zgpd7bX78WkBO15EoelSKzssnKWm7ki4T05EIAojGRLmw==",
      },
    };
    expect(await verifyProof(proof, { signer, chainId: "onyx-1", data: text })).toBe(true);
  });

  it("is the SDK's verifier: yes for a valid proof, no once any expected value differs", async () => {
    const me = wallet();
    const proof = me.sign("onyx-1", "a text");
    const expected = { signer: me.address, chainId: "onyx-1", data: "a text" };
    expect(await verifyProof(proof, expected)).toBe(true);
    expect(await verifyProof(proof, { ...expected, signer: OTHER })).toBe(false);
    expect(await verifyProof(proof, { ...expected, chainId: "gnoland-1" })).toBe(false);
    expect(await verifyProof(proof, { ...expected, data: "a text " })).toBe(false);
  });
});

function retyped(proof: Proof, typeUrl: string): Proof {
  return { ...proof, signature: { ...proof.signature, pubKey: { ...proof.signature.pubKey, typeUrl } } };
}

function resigned(proof: Proof, change: string | ((signature: Buffer) => Buffer)): Proof {
  const bytes = Buffer.from(proof.signature.signature, "base64");
  const signature = typeof change === "string" ? change : change(bytes).toString("base64");
  return { ...proof, signature: { ...proof.signature, signature } };
}

// The same signature with s replaced by n - s: valid for ECDSA, refused by the low-S rule.
function highS(signature: Buffer): Buffer {
  const order = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  const s = BigInt(`0x${signature.subarray(32).toString("hex")}`);
  return Buffer.concat([signature.subarray(0, 32), Buffer.from((order - s).toString(16).padStart(64, "0"), "hex")]);
}

// 10g (ADR-0002 §6): a change an admin signs afresh, through the login's own nonce and verifier, never a login's.
describe("a signed action", () => {
  const HEAD = ["Change gnoworld's settings (admin, version 1)", "", "Jarvis: the daily quota is 20 questions"];
  const ACTION = '{"setting":"quota","questions":20}';
  const signedSetup = (options: { verify?: Verify } = {}) => {
    const db = openDatabase(":memory:", [LOGIN_TABLES, NONCE_HOST, NONCE_ACTION]);
    opened.push(db);
    const clock = { now: T0 };
    const signed = makeSigned(db, { chains: CHAINS, now: () => clock.now, ...options });
    const login = makeLogin(db, { chains: CHAINS, now: () => clock.now, ...options });
    const issue = (chainId = "onyx-1") => {
      const made = signed.issue(chainId, DOMAIN, { head: HEAD, action: ACTION });
      if (typeof made === "string") throw new Error(`no challenge: ${made}`);
      return made;
    };
    return { db, clock, signed, login, issue };
  };

  it("takes the action column at the next start of a file made before it, a login's nonce holding none", () => {
    const folder = mkdtempSync(join(tmpdir(), "gnoworld-actions-"));
    try {
      const file = join(folder, "gnoworld.sqlite");
      openDatabase(file, [LOGIN_TABLES, NONCE_HOST]).close();
      const db = openDatabase(file, [LOGIN_TABLES, NONCE_HOST, NONCE_ACTION]);
      try {
        const login = makeLogin(db, { chains: CHAINS, now: () => T0 });
        challenge(login);
        expect(db.prepare("SELECT action FROM nonces").all()).toEqual([{ action: null }]);
      } finally {
        db.close();
      }
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("writes the head's lines, then the login's own: the domain, the nonce and the times", () => {
    const { issue } = signedSetup();
    const made = issue();
    expect(made.text).toBe(
      [
        ...HEAD,
        "",
        `Domain: ${DOMAIN}`,
        `Nonce: ${made.nonce}`,
        "Issued: 2026-10-22T12:00:00.000Z",
        "Expires: 2026-10-22T12:05:00.000Z",
      ].join("\n"),
    );
  });

  it("hands back the action its nonce was issued with, once the proof of its text passes", async () => {
    const { signed, issue } = signedSetup();
    const me = wallet();
    const made = issue("gnoland-1");
    const proved = await signed.proveAction(
      { nonce: made.nonce, address: me.address, proof: me.sign("gnoland-1", made.text) },
      DOMAIN,
    );
    expect(proved).toEqual({ action: ACTION });
  });

  it("hands the verifier the signer named, the stored chain and the stored text, never the client's", async () => {
    const seen: Parameters<Verify>[1][] = [];
    const { signed, issue } = signedSetup({
      verify: (_, expected) => {
        seen.push(expected);
        return Promise.resolve(true);
      },
    });
    const me = wallet();
    const made = issue("gnoland-1");
    await signed.proveAction(
      { nonce: made.nonce, address: me.address, proof: me.sign("onyx-1", "another text") },
      DOMAIN,
    );
    expect(seen).toEqual([{ signer: me.address, chainId: "gnoland-1", data: made.text }]);
  });

  it("spends an action's nonce before verifying, so a refused proof buys no second try", async () => {
    let answer = false;
    const { signed, issue } = signedSetup({ verify: () => Promise.resolve(answer) });
    const me = wallet();
    const made = issue();
    const request = { nonce: made.nonce, address: me.address, proof: me.sign("onyx-1", made.text) };
    expect(await signed.proveAction(request, DOMAIN)).toBe("proof");
    answer = true;
    expect(await signed.proveAction(request, DOMAIN)).toBe("nonce");
  });

  it("proves an action once, verifying once, when the same proof arrives twice at once", async () => {
    let calls = 0;
    const { signed, issue } = signedSetup({
      verify: () => {
        calls += 1;
        return new Promise((resolve) =>
          setImmediate(() => {
            resolve(true);
          }),
        );
      },
    });
    const me = wallet();
    const made = issue();
    const request = { nonce: made.nonce, address: me.address, proof: me.sign("onyx-1", made.text) };
    const results = await Promise.all([signed.proveAction(request, DOMAIN), signed.proveAction(request, DOMAIN)]);
    expect(results).toContainEqual({ action: ACTION });
    expect(results).toContain("nonce");
    expect(calls).toBe(1);
  });

  it("refuses an action's nonce from another host, or past its five minutes", async () => {
    const { clock, signed, issue } = signedSetup();
    const me = wallet();
    const elsewhere = issue();
    const request = { nonce: elsewhere.nonce, address: me.address, proof: me.sign("onyx-1", elsewhere.text) };
    expect(await signed.proveAction(request, "gnoworld.test.evil")).toBe("nonce");
    const late = issue();
    clock.now += TTL;
    const after = { nonce: late.nonce, address: me.address, proof: me.sign("onyx-1", late.text) };
    expect(await signed.proveAction(after, DOMAIN)).toBe("nonce");
  });

  it("never logs in with an action's nonce, which stays for its action", async () => {
    const { signed, login, issue } = signedSetup();
    const me = wallet();
    const made = issue();
    const request = { nonce: made.nonce, address: me.address, proof: me.sign("onyx-1", made.text) };
    expect(await login.verify(request, anyone, DOMAIN)).toBe("nonce");
    expect(await signed.proveAction(request, DOMAIN)).toEqual({ action: ACTION });
  });

  it("never proves an action with a login's nonce, which stays for its login", async () => {
    const { signed, login } = signedSetup();
    const me = wallet();
    const made = challenge(login);
    const request = { nonce: made.nonce, address: me.address, proof: me.sign("onyx-1", made.text) };
    expect(await signed.proveAction(request, DOMAIN)).toBe("nonce");
    expect(typeof (await login.verify(request, anyone, DOMAIN))).toBe("object");
  });

  it("issues an action's nonce for the chains the login takes alone, under the same cap", () => {
    const db = openDatabase(":memory:", [LOGIN_TABLES, NONCE_HOST, NONCE_ACTION]);
    opened.push(db);
    const signed = makeSigned(db, { chains: CHAINS, now: () => T0, nonceCap: 2 });
    const login = makeLogin(db, { chains: CHAINS, now: () => T0, nonceCap: 2 });
    expect(signed.issue("another-1", DOMAIN, { head: HEAD, action: ACTION })).toBe("chain");
    expect(typeof signed.issue("onyx-1", DOMAIN, { head: HEAD, action: ACTION })).toBe("object");
    expect(typeof login.challenge("onyx-1", DOMAIN)).toBe("object");
    expect([signed.issue("onyx-1", DOMAIN, { head: HEAD, action: ACTION }), login.challenge("onyx-1", DOMAIN)]).toEqual(
      ["full", "full"],
    );
  });
});

// 10g (ADR-0002 §6; Alexis, 10g-6): the admin console's login, on its own listener: its pending nonces counted for its
// own host alone.
describe("the admin console's login", () => {
  const CONSOLE = "admin.gnoworld.test";
  const consoleSetup = () => {
    const db = openDatabase(":memory:", [LOGIN_TABLES, NONCE_HOST, NONCE_ACTION]);
    opened.push(db);
    const clock = { now: T0 };
    const now = () => clock.now;
    const site = makeLogin(db, { chains: CHAINS, now, nonceCap: 2 });
    const admin = makeLogin(db, { chains: CHAINS, now, nonceCap: 2, console: true });
    const signed = makeSigned(db, { chains: CHAINS, now, nonceCap: 2, console: true });
    return { db, clock, site, admin, signed };
  };
  it("counts its own host's pending nonces alone, so the public site at its cap leaves its login and changes be", () => {
    const { site, admin, signed } = consoleSetup();
    for (let at = 0; at < 2; at += 1) site.challenge("onyx-1", DOMAIN);
    expect(site.challenge("onyx-1", DOMAIN)).toBe("full");
    expect(typeof admin.challenge("onyx-1", CONSOLE)).toBe("object");
    expect(typeof signed.issue("onyx-1", CONSOLE, { head: ["A change"], action: "{}" })).toBe("object");
    expect(admin.challenge("onyx-1", CONSOLE)).toBe("full");
  });

  it("leaves the public site's count the global one, the console's nonces in it, while the console counts its own", () => {
    const { site, admin } = consoleSetup();
    site.challenge("onyx-1", DOMAIN);
    admin.challenge("onyx-1", CONSOLE);
    expect(site.challenge("onyx-1", DOMAIN)).toBe("full");
    expect(typeof admin.challenge("onyx-1", CONSOLE)).toBe("object");
  });
});
