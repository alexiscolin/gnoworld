import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { Address, Nonce } from "@gnoworld/schemas";
import { openDatabase } from "@gnoworld/service/db";
import { afterEach, describe, expect, it } from "vitest";
import { migrations } from "../migrations.ts";
import { cliFile, cliKey, type CliKey } from "../testing/cliSigner.ts";
import { wallet, type Wallet } from "../testing/signer.ts";
import { cliVerify } from "./cliProof.ts";
import { makeLinks, type LinkKind, type Links, type Verifiers } from "./links.ts";
import { makeLogin, makeSigned, type Verify } from "./login.ts";

const T0 = Date.parse("2026-11-11T12:00:00.000Z");
const MINUTE = 60_000;
const HOST = "gnoworld.test";
const CHAIN = "onyx-1";
const PEPPER = "a-pepper-of-forty-characters-0123456789";
const BEFORE_LINKS = 20;
const yesFile: Verifiers["cli"] = () => Promise.resolve(true);
const slowYes: Verify = () =>
  new Promise((resolve) =>
    setTimeout(() => {
      resolve(true);
    }, 5),
  );

const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

type Start = Partial<Parameters<Links["startLink"]>[0]>;
type Finish = Partial<Omit<Parameters<Links["finishLink"]>[0], "by" | "kind" | "proof" | "file">> & {
  by: Wallet;
  who: Wallet;
  text?: string;
  kind?: LinkKind;
  proof?: ReturnType<Wallet["sign"]>;
};
const setup = (options: { adena?: Verify; cli?: Verifiers["cli"]; linkCap?: number; nonceCap?: number } = {}) => {
  const { adena, cli, linkCap, nonceCap } = options;
  const db = openDatabase(":memory:", migrations);
  opened.push(db);
  const clock = { now: T0 };
  const now = () => clock.now;
  const verifiers = { ...(adena === undefined ? {} : { adena }), ...(cli === undefined ? {} : { cli }) };
  const links = makeLinks(db, {
    now,
    chainId: CHAIN,
    secret: PEPPER,
    verifiers,
    ...(linkCap === undefined ? {} : { linkCap }),
  });
  const caps = nonceCap === undefined ? {} : { nonceCap };
  const signed = makeSigned(db, { chains: [CHAIN], now, ...caps });
  const login = makeLogin(db, { chains: [CHAIN], now, ...caps });
  const ask = (by: Pick<Wallet, "address">, who: Pick<Wallet, "address">, over: Start = {}) =>
    links.startLink({ by: by.address, kind: "adena", subject: who.address, host: HOST, signedAt: clock.now, ...over });
  const started = (by: Pick<Wallet, "address">, who: Pick<Wallet, "address">, over: Start = {}) => {
    const made = ask(by, who, over);
    if (typeof made === "string") throw new Error(`no link code: ${made}`);
    return made;
  };
  // The code `made`, finished by `by` with `who`'s proof of its text, each part overridable.
  const finish = (
    { nonce, text }: { nonce: string; text: string },
    { by, who, text: signed = text, kind = "adena", proof = who.sign(CHAIN, signed), ...over }: Finish,
  ) =>
    links.finishLink({
      nonce,
      by: by.address,
      address: who.address,
      host: HOST,
      signedAt: clock.now,
      ...(kind === "cli" ? { kind, file: "" } : { kind, proof }),
      ...over,
    });
  const link = (a: Wallet, b: Wallet) => finish(started(a, b), { by: a, who: b });
  const unlink = (by: Wallet, who: Wallet, ...at: [] | [number | undefined]) =>
    links.unlink({ by: by.address, address: who.address, signedAt: at.length === 0 ? clock.now : at[0] });
  return { db, clock, links, signed, login, ask, started, finish, link, unlink };
};

const count = (db: DatabaseSync, table: string): number => {
  const row = db.prepare(`SELECT count(*) AS n FROM ${table}`).get();
  return Number(row?.["n"]);
};
const addresses = (...who: Wallet[]): Address[] => who.map(({ address }) => address).sort();
const membersOf = (result: Awaited<ReturnType<Links["finishLink"]>> | ReturnType<Links["unlink"]>) =>
  typeof result === "string" ? result : [...result.members].sort();
// Every link names an identity that exists, and no identity is left with fewer than two members.
const consistent = (db: DatabaseSync): void => {
  expect(db.prepare("SELECT address FROM links WHERE identity NOT IN (SELECT id FROM identities)").all()).toEqual([]);
  expect(db.prepare("SELECT identity FROM links GROUP BY identity HAVING count(*) < 2").all()).toEqual([]);
  expect(count(db, "identities")).toBe(
    Number(db.prepare("SELECT count(DISTINCT identity) AS n FROM links").get()?.["n"]),
  );
};

describe("the text a link asks to sign", () => {
  it("names both accounts, the site, the chain and the grant in words, and ends on the code, built by the server alone", () => {
    const s = setup();
    const [a, b] = [wallet(), wallet()];
    const made = s.started(a, b);
    expect(made.text).toBe(
      `Link ${b.address} to ${a.address} on ${HOST}. From now on each of them moderates the rooms of every world the other owns on ${CHAIN}. Nothing else is granted. Code ${made.nonce}`,
    );
    expect(Nonce.safeParse(made.nonce).success).toBe(true);
  });

  it("gives a code ten minutes, no more", () => {
    const s = setup();
    expect(s.started(wallet(), wallet()).expiresAt).toBe(new Date(T0 + 10 * MINUTE).toISOString());
  });
});

describe("a link names every account it joins, and is spent only as a link", () => {
  const joining = (list: Address[]): string =>
    list.length === 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} and ${list.at(-1) ?? ""}`;
  const plural = ({ b, a, others, nonce }: { b: Address; a: Address; others: Address[]; nonce: string }): string =>
    `Link ${b} to ${a} on ${HOST}, joining ${joining(others)}. From now on each of these accounts moderates the rooms of every world any of them owns on ${CHAIN}. Nothing else is granted. Code ${nonce}`;

  it("names the account already linked to A in the text B signs, so B never joins a name it did not see", async () => {
    const s = setup();
    const [a, b, c] = [wallet(), wallet(), wallet()];
    await s.link(c, a);
    const made = s.started(a, b);
    expect(made.text).toBe(plural({ b: b.address, a: a.address, others: [c.address], nonce: made.nonce }));
  });

  it("lists two accounts with 'and', and three with a comma list before it, in a stable order", async () => {
    const s = setup();
    const [a, b, c, d, e] = [wallet(), wallet(), wallet(), wallet(), wallet()];
    await s.link(c, a);
    await s.link(a, d);
    const two = s.started(a, b);
    expect(two.text).toBe(plural({ b: b.address, a: a.address, others: addresses(c, d), nonce: two.nonce }));
    await s.link(a, e);
    const three = s.started(a, b);
    expect(three.text).toBe(plural({ b: b.address, a: a.address, others: addresses(c, d, e), nonce: three.nonce }));
  });

  it("never names the account the code is for among those it joins, when it is already in A's identity", async () => {
    const s = setup();
    const [a, c] = [wallet(), wallet()];
    await s.link(c, a);
    const made = s.started(a, c);
    expect(made.text).toBe(
      `Link ${c.address} to ${a.address} on ${HOST}. From now on each of them moderates the rooms of every world the other owns on ${CHAIN}. Nothing else is granted. Code ${made.nonce}`,
    );
  });

  it("links nothing when an account joined A's identity after B's code was issued", async () => {
    const s = setup();
    const [a, b, c] = [wallet(), wallet(), wallet()];
    const made = s.started(a, b);
    await s.link(c, a);
    const [links, identities] = [count(s.db, "links"), count(s.db, "identities")];
    expect(await s.finish(made, { by: a, who: b })).toBe("nonce");
    expect([count(s.db, "links"), count(s.db, "identities")]).toEqual([links, identities]);
    expect(s.links.identityOf(b.address)).toEqual([b.address]);
  });

  it("keeps a code spendable by the old image's login statement away: it never matches a link code, host and all", () => {
    const s = setup();
    const made = s.started(wallet(), wallet());
    const old = s.db.prepare(
      "DELETE FROM nonces WHERE nonce = ? AND host = ? AND expires_at > ? AND action IS NULL RETURNING chain, text",
    );
    expect(old.get(made.nonce, HOST, T0)).toBeUndefined();
    expect(count(s.db, "nonces")).toBe(1);
  });
});

describe("startLink", () => {
  it("refuses a session signed 10 minutes and a millisecond ago, or with no signing time, so a stolen session makes no lasting link", () => {
    const s = setup();
    const [a, b] = [wallet(), wallet()];
    expect(s.ask(a, b, { signedAt: T0 - 10 * MINUTE - 1 })).toBe("stale");
    expect(s.ask(a, b, { signedAt: undefined })).toBe("stale");
    expect(typeof s.ask(a, b, { signedAt: T0 - 10 * MINUTE })).toBe("object");
  });

  it("refuses to link an address to itself, and writes nothing", () => {
    const s = setup();
    const a = wallet();
    expect(s.ask(a, a)).toBe("self");
    expect(count(s.db, "nonces")).toBe(0);
  });

  it("refuses a sixth pending code of one account, not another account's first, and counts none that expired", () => {
    const s = setup();
    const a = wallet();
    for (let at = 0; at < 5; at += 1) s.started(a, wallet());
    expect(s.ask(a, wallet())).toBe("pending");
    expect(typeof s.ask(wallet(), wallet())).toBe("object");
    s.clock.now = T0 + 10 * MINUTE;
    expect(typeof s.ask(a, wallet())).toBe("object");
  });

  it("refuses an 11th member at the start, so a full identity learns it before it asks anyone to sign", async () => {
    const s = setup();
    const a = wallet();
    for (let at = 0; at < 9; at += 1) await s.link(a, wallet());
    expect(s.ask(a, wallet())).toBe("members");
  });

  it("refuses a link code at its own cap and still gives a login its nonce, so a link flood locks no login out", () => {
    const s = setup({ linkCap: 3 });
    for (let at = 0; at < 3; at += 1) s.started(wallet(), wallet());
    expect(s.ask(wallet(), wallet())).toBe("full");
    expect(typeof s.login.challenge(CHAIN, HOST)).toBe("object");
  });

  it("does not count login nonces in the link cap", () => {
    const s = setup({ linkCap: 3 });
    for (let at = 0; at < 3; at += 1) s.login.challenge(CHAIN, HOST);
    expect(typeof s.ask(wallet(), wallet())).toBe("object");
  });

  it("refuses no link when the login's nonces fill the login's cap, so a login flood locks no link out", () => {
    const s = setup({ nonceCap: 3 });
    for (let at = 0; at < 3; at += 1) s.login.challenge(CHAIN, HOST);
    expect(s.login.challenge(CHAIN, HOST)).toBe("full");
    expect(typeof s.ask(wallet(), wallet())).toBe("object");
  });

  it("does not count link codes in the login's cap", () => {
    const s = setup({ nonceCap: 3 });
    for (let at = 0; at < 4; at += 1) s.started(wallet(), wallet());
    expect(typeof s.login.challenge(CHAIN, HOST)).toBe("object");
  });
});

describe("finishLink: whose nonce, spent how", () => {
  it("finishes no link for C with B's proof of a nonce issued to A", async () => {
    const s = setup();
    const [a, b, c] = [wallet(), wallet(), wallet()];
    const made = s.started(a, b);
    expect(await s.finish(made, { by: c, who: b })).toBe("nonce");
    expect(count(s.db, "links")).toBe(0);
  });

  it("finishes no link to an address the nonce was not issued for, with the proof of that address", async () => {
    const s = setup();
    const [a, b, c] = [wallet(), wallet(), wallet()];
    const made = s.started(a, b);
    expect(await s.finish(made, { by: a, who: c })).toBe("nonce");
    expect(count(s.db, "links")).toBe(0);
  });

  it("refuses the nonce of another session, and another site's", async () => {
    const s = setup();
    const [a, b] = [wallet(), wallet()];
    const made = s.started(a, b);
    expect(await s.finish(made, { by: b, who: b })).toBe("nonce");
    const again = s.started(a, b);
    expect(await s.finish(again, { by: a, who: b, host: "gnoworld.evil" })).toBe("nonce");
  });

  it("refuses a code issued for the command line when finished as Adena's, and the reverse, and keeps it for its own kind", async () => {
    const s = setup({ cli: yesFile });
    const [a, b] = [wallet(), wallet()];
    const cli = s.started(a, b, { kind: "cli" });
    expect(await s.finish(cli, { by: a, who: b, kind: "adena" })).toBe("nonce");
    const adena = s.started(a, b, { kind: "adena" });
    expect(await s.finish(adena, { by: a, who: b, kind: "cli" })).toBe("nonce");
    expect(membersOf(await s.finish(adena, { by: a, who: b }))).toEqual(addresses(a, b));
    expect(await s.finish(cli, { by: a, who: b, kind: "cli" })).toBe("linked");
  });

  it("refuses a command-line link where no verifier is given, so the seam never links anyone unproved", async () => {
    const s = setup();
    const [a, b] = [wallet(), wallet()];
    const made = s.started(a, b, { kind: "cli" });
    expect(await s.finish(made, { by: a, who: b, kind: "cli" })).toBe("proof");
    expect(count(s.db, "links")).toBe(0);
  });

  it("refuses the proof of a text other than the stored one, and of the right text by another key", async () => {
    const s = setup();
    const [a, b, c] = [wallet(), wallet(), wallet()];
    const made = s.started(a, b);
    expect(await s.finish(made, { by: a, who: b, text: `${made.text} and more` })).toBe("proof");
    const second = s.started(a, b);
    expect(await s.finish(second, { by: a, who: b, proof: c.sign(CHAIN, second.text) })).toBe("proof");
    expect(count(s.db, "links")).toBe(0);
  });

  it("hands the verifier the signer, the stored chain and the stored text, never the client's", async () => {
    const seen: Parameters<Verify>[1][] = [];
    const s = setup({
      adena: (_, expected) => {
        seen.push(expected);
        return Promise.resolve(true);
      },
    });
    const [a, b] = [wallet(), wallet()];
    const made = s.started(a, b);
    await s.finish(made, { by: a, who: b, text: "another text" });
    expect(seen).toEqual([{ signer: b.address, chainId: CHAIN, data: made.text }]);
  });

  it("makes one link when two verifies of one proof arrive at once", async () => {
    let calls = 0;
    const s = setup({
      adena: () => {
        calls += 1;
        return new Promise((resolve) =>
          setTimeout(() => {
            resolve(true);
          }, 5),
        );
      },
    });
    const [a, b] = [wallet(), wallet()];
    const made = s.started(a, b);
    const results = await Promise.all([s.finish(made, { by: a, who: b }), s.finish(made, { by: a, who: b })]);
    expect(results.filter((r) => r === "nonce")).toHaveLength(1);
    expect(results.filter((r) => typeof r === "object")).toHaveLength(1);
    expect(calls).toBe(1);
    expect(count(s.db, "links")).toBe(2);
  });

  it("refuses a second use of a nonce", async () => {
    const s = setup();
    const [a, b] = [wallet(), wallet()];
    const made = s.started(a, b);
    expect(membersOf(await s.finish(made, { by: a, who: b }))).toEqual(addresses(a, b));
    expect(await s.finish(made, { by: a, who: b })).toBe("nonce");
  });

  it("spends the nonce even when the proof is refused, so a bad proof buys no second try", async () => {
    const s = setup();
    const [a, b] = [wallet(), wallet()];
    const made = s.started(a, b);
    expect(await s.finish(made, { by: a, who: b, text: "x" })).toBe("proof");
    expect(await s.finish(made, { by: a, who: b })).toBe("nonce");
    expect(count(s.db, "nonces")).toBe(0);
  });

  it("refuses, and does not reject, when the verifier throws or rejects", async () => {
    const throws: Verify = () => {
      throw new Error("down");
    };
    const rejects: Verify = () => Promise.reject(new Error("down"));
    for (const adena of [throws, rejects]) {
      const s = setup({ adena });
      const [a, b] = [wallet(), wallet()];
      const made = s.started(a, b);
      expect(await s.finish(made, { by: a, who: b })).toBe("proof");
      expect(count(s.db, "links")).toBe(0);
    }
  });

  it("accepts a nonce 9 minutes 59 seconds after it was issued and refuses it at 10 minutes", async () => {
    const s = setup();
    const [a, b] = [wallet(), wallet()];
    const early = s.started(a, b);
    s.clock.now = T0 + 10 * MINUTE - 1;
    expect(membersOf(await s.finish(early, { by: a, who: b, signedAt: T0 }))).toEqual(addresses(a, b));
    const [c, d] = [wallet(), wallet()];
    const exact = s.started(c, d);
    s.clock.now += 10 * MINUTE;
    expect(await s.finish(exact, { by: c, who: d, signedAt: s.clock.now })).toBe("nonce");
  });

  it("refuses a stale session, or none, at the end of a link, and keeps the code for the session that signs again", async () => {
    const s = setup();
    const [a, b] = [wallet(), wallet()];
    const made = s.started(a, b);
    expect(await s.finish(made, { by: a, who: b, signedAt: T0 - 11 * MINUTE })).toBe("stale");
    expect(await s.finish(made, { by: a, who: b, signedAt: undefined })).toBe("stale");
    expect(membersOf(await s.finish(made, { by: a, who: b }))).toEqual(addresses(a, b));
  });
});

describe("the nonce kinds are disjoint", () => {
  it("lets a link nonce spend at no login proof, no admin change and no login", async () => {
    const s = setup();
    const [a, b] = [wallet(), wallet()];
    const made = s.started(a, b);
    const request = { nonce: made.nonce, address: b.address, proof: b.sign(CHAIN, made.text) };
    expect(await s.signed.prove(request, HOST)).toBe("nonce");
    expect(await s.signed.proveAction(request, HOST)).toBe("nonce");
    expect(await s.login.verify(request, () => true, HOST)).toBe("nonce");
    expect(count(s.db, "nonces")).toBe(1);
  });

  it("lets a login nonce and an admin nonce spend at no link", async () => {
    const s = setup();
    const [a, b] = [wallet(), wallet()];
    for (const action of [undefined, "ban"]) {
      const made = s.signed.issue(CHAIN, HOST, { head: ["x"], ...(action === undefined ? {} : { action }) });
      if (typeof made === "string") throw new Error(made);
      expect(await s.finish(made, { by: a, who: b })).toBe("nonce");
    }
    expect(count(s.db, "nonces")).toBe(2);
  });

  it("spends a nonce row the image before wrote, with no link columns, as a login's and never as a link's", async () => {
    const s = setup();
    const me = wallet();
    const insert = s.db.prepare(
      "INSERT INTO nonces (nonce, chain, host, text, expires_at) VALUES (?, ?, ?, 'old text', ?)",
    );
    insert.run("old".padEnd(22, "a"), CHAIN, HOST, T0 + MINUTE);
    insert.run("two".padEnd(22, "a"), CHAIN, HOST, T0 + MINUTE);
    const request = { nonce: "old".padEnd(22, "a"), address: me.address, proof: me.sign(CHAIN, "old text") };
    expect(await s.signed.prove(request, HOST)).toBe("proved");
    expect(await s.finish({ nonce: "two".padEnd(22, "a"), text: "old text" }, { by: me, who: wallet() })).toBe("nonce");
  });
});

describe("what an unlink leaves (privacy review, low)", () => {
  it("leaves no row of the links, identities or nonces naming the account that linked the others, once it unlinks itself", async () => {
    const s = setup();
    const [a, b, c] = [wallet(), wallet(), wallet()];
    await s.link(a, b);
    await s.link(a, c);
    expect(s.unlink(a, a)).not.toBe("none");
    const rows = ["links", "identities", "nonces"].flatMap((table) => s.db.prepare(`SELECT * FROM ${table}`).all());
    expect(JSON.stringify(rows)).not.toContain(a.address);
    expect(s.links.list(b.address).map(({ address }) => address)).toEqual(addresses(b, c));
  });
});

describe("uniqueness and the cap", () => {
  it("writes both rows with the way each was used and when", async () => {
    const s = setup({ cli: yesFile });
    const [a, b] = [wallet(), wallet()];
    const made = s.started(a, b, { kind: "cli" });
    await s.finish(made, { by: a, who: b, kind: "cli" });
    const rows = s.db.prepare("SELECT address, kind, linked_at FROM links ORDER BY address").all();
    expect(rows).toEqual(
      [
        { address: a.address, kind: "adena", linked_at: T0 },
        { address: b.address, kind: "cli", linked_at: T0 },
      ].sort((x, y) => x.address.localeCompare(y.address)),
    );
  });

  it("links B to A, and refuses B to C once B is linked to A, leaving no row of C", async () => {
    const s = setup();
    const [a, b, c] = [wallet(), wallet(), wallet()];
    expect(membersOf(await s.link(a, b))).toEqual(addresses(a, b));
    const [links, identities] = [count(s.db, "links"), count(s.db, "identities")];
    expect(await s.link(c, b)).toBe("linked");
    expect([count(s.db, "links"), count(s.db, "identities")]).toEqual([links, identities]);
    expect(s.links.identityOf(c.address)).toEqual([c.address]);
    consistent(s.db);
  });

  it("refuses a real merge: A and B each in an identity of their own, linked, change neither", async () => {
    const s = setup();
    const [a, a2, b, b2] = [wallet(), wallet(), wallet(), wallet()];
    await s.link(a, a2);
    await s.link(b, b2);
    expect(await s.link(a, b)).toBe("linked");
    expect(s.links.identityOf(a.address).sort()).toEqual(addresses(a, a2));
    expect(s.links.identityOf(b.address).sort()).toEqual(addresses(b, b2));
    consistent(s.db);
  });

  it("answers a second link of one pair 'linked', writes no second row and spends no seat", async () => {
    const s = setup();
    const [a, b] = [wallet(), wallet()];
    const [first, second] = [s.started(a, b), s.started(a, b)];
    await s.finish(first, { by: a, who: b });
    expect(await s.finish(second, { by: a, who: b })).toBe("linked");
    expect(count(s.db, "links")).toBe(2);
    let last: ReturnType<typeof membersOf> = [];
    for (let at = 0; at < 8; at += 1) last = membersOf(await s.link(a, wallet()));
    expect(last).toHaveLength(10);
  });

  it("answers an unproved B the same whether B is linked or free, so the refusal tells nothing of a key not held", async () => {
    const s = setup();
    const [a, b, c, d] = [wallet(), wallet(), wallet(), wallet()];
    await s.link(a, b);
    const answers: unknown[] = [];
    for (const target of [b, c]) {
      const made = s.started(d, target);
      answers.push(await s.finish(made, { by: d, who: d }));
      const second = s.started(d, target);
      answers.push(await s.finish(second, { by: d, who: target, text: "not the text" }));
    }
    expect(answers).toEqual(["nonce", "proof", "nonce", "proof"]);
  });

  it("keeps ten members when two inserts of the tenth arrive at once, and leaves nothing of the loser", async () => {
    const s = setup({ adena: slowYes });
    const a = wallet();
    for (let at = 0; at < 8; at += 1) await s.link(a, wallet());
    const [x, y] = [wallet(), wallet()];
    const [one, two] = [s.started(a, x), s.started(a, y)];
    const results = await Promise.all([s.finish(one, { by: a, who: x }), s.finish(two, { by: a, who: y })]);
    // The loser's text named one member fewer than the identity now has: its code is refused, the cap holds.
    expect(results.filter((r) => r === "nonce")).toHaveLength(1);
    expect(s.links.identityOf(a.address)).toHaveLength(10);
    expect(count(s.db, "links")).toBe(10);
    consistent(s.db);
  });

  it("answers members, and rolls the whole link back, when the insert takes no seat although the text matched", async () => {
    const s = setup();
    const [a, b] = [wallet(), wallet()];
    const made = s.started(a, b);
    // The seat is taken between the text's check and the insert, as only a second writer could: the insert is skipped.
    s.db.exec(
      `CREATE TRIGGER skip_seat BEFORE INSERT ON links WHEN NEW.address = '${b.address}' BEGIN SELECT RAISE(IGNORE); END`,
    );
    expect(await s.finish(made, { by: a, who: b })).toBe("members");
    expect([count(s.db, "identities"), count(s.db, "links")]).toEqual([1, 1]);
  });

  it("leaves no identity and no row when the proof is refused", async () => {
    const s = setup();
    const [a, b] = [wallet(), wallet()];
    const made = s.started(a, b);
    await s.finish(made, { by: a, who: b, text: "x" });
    expect([count(s.db, "identities"), count(s.db, "links")]).toEqual([0, 0]);
  });

  it("links nothing when A's identity changes while the proof is awaited, never under the identity it had at the start", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let gated = false;
    const s = setup({ adena: () => (gated ? gate.then(() => true) : Promise.resolve(true)) });
    const [a, x, b] = [wallet(), wallet(), wallet()];
    await s.link(a, x);
    const made = s.started(a, b);
    gated = true;
    const pending = s.finish(made, { by: a, who: b });
    expect(membersOf(s.unlink(a, x))).toEqual([a.address]);
    release();
    expect(await pending).toBe("nonce");
    expect(s.links.identityOf(b.address)).toEqual([b.address]);
    expect(count(s.db, "links")).toBe(0);
    consistent(s.db);
  });
});

describe("unlink and identityOf", () => {
  it("drops the identity when one member is left, since an identity of one is no link", async () => {
    const s = setup();
    const [a, b] = [wallet(), wallet()];
    await s.link(a, b);
    expect(s.unlink(a, b)).toEqual({ members: [a.address] });
    expect([count(s.db, "links"), count(s.db, "identities")]).toEqual([0, 0]);
    expect(s.links.identityOf(a.address)).toEqual([a.address]);
  });

  it("lets a member unlink itself, and keeps the identity of the two left", async () => {
    const s = setup();
    const [a, b, c] = [wallet(), wallet(), wallet()];
    await s.link(a, b);
    await s.link(a, c);
    expect(membersOf(s.unlink(b, b))).toEqual(addresses(a, c));
    expect(s.links.identityOf(b.address)).toEqual([b.address]);
    expect(s.links.identityOf(a.address).sort()).toEqual(addresses(a, c));
    consistent(s.db);
  });

  it("lets a member unlink another when three or more are left", async () => {
    const s = setup();
    const [a, b, c, d] = [wallet(), wallet(), wallet(), wallet()];
    for (const other of [b, c, d]) await s.link(a, other);
    expect(membersOf(s.unlink(a, d))).toEqual(addresses(a, b, c));
    expect(s.links.identityOf(d.address)).toEqual([d.address]);
    consistent(s.db);
  });

  it("answers 'none' alike for a free by, a free target and a target of another identity", async () => {
    const s = setup();
    const [a, b, d, e, free] = [wallet(), wallet(), wallet(), wallet(), wallet()];
    await s.link(a, b);
    await s.link(d, e);
    expect([s.unlink(free, b), s.unlink(a, free), s.unlink(d, b), s.unlink(free, free)]).toEqual([
      "none",
      "none",
      "none",
      "none",
    ]);
    expect(count(s.db, "links")).toBe(4);
  });

  it("refuses a session signed 10 minutes and a millisecond ago, or none, and unlinks nothing", async () => {
    const s = setup();
    const [a, b] = [wallet(), wallet()];
    await s.link(a, b);
    expect(s.unlink(a, b, T0 - 10 * MINUTE - 1)).toBe("stale");
    expect(s.unlink(a, b, undefined)).toBe("stale");
    expect(s.links.identityOf(b.address)).toHaveLength(2);
  });

  it("gives the address alone for one that is linked to nothing", () => {
    const s = setup();
    const a = wallet();
    expect(s.links.identityOf(a.address)).toEqual([a.address]);
  });

  it("gives every member of a linked address, itself included", async () => {
    const s = setup();
    const [a, b] = [wallet(), wallet()];
    await s.link(a, b);
    expect(s.links.identityOf(b.address).sort()).toEqual(addresses(a, b));
  });
});

describe("the link migrations", () => {
  it("run on a file made before them, keeping its nonces, and the image before still writes a nonce", async () => {
    const folder = mkdtempSync(join(tmpdir(), "gnoworld-links-"));
    try {
      const file = join(folder, "gnoworld.sqlite");
      const before = openDatabase(file, migrations.slice(0, BEFORE_LINKS));
      before
        .prepare("INSERT INTO nonces (nonce, chain, host, text, expires_at) VALUES (?, ?, ?, 't', ?)")
        .run("kept".padEnd(22, "a"), CHAIN, HOST, T0 + MINUTE);
      before.close();
      const db = openDatabase(file, migrations);
      opened.push(db);
      expect(migrations.length).toBeGreaterThan(BEFORE_LINKS);
      expect(db.prepare("SELECT kind, owner, subject FROM nonces").get()).toEqual({
        kind: null,
        owner: null,
        subject: null,
      });
      db.prepare("INSERT INTO nonces (nonce, chain, host, text, expires_at) VALUES ('image', ?, ?, 't', ?)").run(
        CHAIN,
        HOST,
        T0 + MINUTE,
      );
      const signed = makeSigned(db, { chains: [CHAIN], now: () => T0 });
      const me = wallet();
      expect(
        await signed.prove({ nonce: "kept".padEnd(22, "a"), address: me.address, proof: me.sign(CHAIN, "t") }, HOST),
      ).toBe("proved");
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("make links STRICT, one identity an address, only the two kinds, a real identity, a number for the time", () => {
    const db = openDatabase(":memory:", migrations);
    opened.push(db);
    const insert = (address: string, kind: string, extra: { identity?: string; at?: number | string } = {}) =>
      db
        .prepare("INSERT INTO links (address, identity, kind, linked_at) VALUES (?, ?, ?, ?)")
        .run(address, extra.identity ?? "i", kind, extra.at ?? 1);
    db.prepare("INSERT INTO identities (id, created_at) VALUES ('i', 1)").run();
    insert("g1a", "adena");
    expect(() => insert("g1a", "cli")).toThrow();
    expect(() => insert("g1b", "other")).toThrow();
    expect(() => insert("g1c", "cli", { identity: "none" })).toThrow();
    expect(() => insert("g1d", "cli", { at: "x" })).toThrow();
  });

  it("let a nonce carry only the two kinds, and index the nonces of an owner and the links of an identity", () => {
    const db = openDatabase(":memory:", migrations);
    opened.push(db);
    const bad =
      "INSERT INTO nonces (nonce, chain, host, text, kind, expires_at) VALUES ('n', 'c', 'h', 't', 'login', 1)";
    expect(() => db.prepare(bad).run()).toThrow();
    const names = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all();
    expect(names).toEqual(expect.arrayContaining([{ name: "nonces_by_owner" }, { name: "links_by_identity" }]));
  });
});

describe("the command-line proof through finishLink (part 3)", () => {
  const ready = () => {
    const s = setup({ cli: cliVerify });
    const [a, key] = [wallet(), cliKey()];
    const made = s.links.startLink({ by: a.address, kind: "cli", subject: key.address, host: HOST, signedAt: T0 });
    if (typeof made === "string") throw new Error(`no link code: ${made}`);
    const finish = (file: string) =>
      s.links.finishLink({
        nonce: made.nonce,
        by: a.address,
        address: key.address,
        host: HOST,
        signedAt: T0,
        kind: "cli",
        file,
      });
    return { s, a, key, made, finish };
  };

  it("links the account when the pasted file carries the key's signature of the stored text", async () => {
    const { s, a, key, made, finish } = ready();
    expect(membersOf(await finish(cliFile(key, made.text)))).toEqual([a.address, key.address].sort());
    expect(count(s.db, "links")).toBe(2);
  });

  it("refuses a file signed for another memo, and the code is spent", async () => {
    const { s, key, made, finish } = ready();
    expect(await finish(cliFile(key, made.text, { doc: { memo: `${made.text} more` } }))).toBe("proof");
    expect(await finish(cliFile(key, made.text))).toBe("nonce");
    expect(count(s.db, "links")).toBe(0);
  });

  it("refuses a file signed by a key that is not the subject's, the right text notwithstanding", async () => {
    const { s, made, finish } = ready();
    expect(await finish(cliFile(cliKey(), made.text))).toBe("proof");
    expect(count(s.db, "links")).toBe(0);
  });

  it("refuses a good file a second time: the code was spent by the first", async () => {
    const { s, key, made, finish } = ready();
    const file = cliFile(key, made.text);
    expect(typeof (await finish(file))).toBe("object");
    expect(await finish(file)).toBe("nonce");
    expect(count(s.db, "links")).toBe(2);
  });

  it("refuses a good file for a code issued for Adena, which stays unspent", async () => {
    const s = setup({ cli: cliVerify });
    const [a, key] = [wallet(), cliKey()];
    const made = s.links.startLink({ by: a.address, kind: "adena", subject: key.address, host: HOST, signedAt: T0 });
    if (typeof made === "string") throw new Error(`no link code: ${made}`);
    const file = cliFile(key, made.text);
    const request = { nonce: made.nonce, by: a.address, address: key.address, host: HOST, signedAt: T0 };
    expect(await s.links.finishLink({ ...request, kind: "cli", file })).toBe("nonce");
    expect(count(s.db, "nonces")).toBeGreaterThan(0);
  });

  it("issues no command-line code for a host the chain would encode differently, and an Adena one all the same", () => {
    const s = setup();
    const [a, b] = [wallet(), wallet()];
    expect(s.ask(a, b, { kind: "cli", host: "gnoworld.test&x" })).toBe("text");
    expect(count(s.db, "nonces")).toBe(0);
    expect(typeof s.ask(a, b, { kind: "adena", host: "gnoworld.test&x" })).toBe("object");
  });
});

describe("the members as a list shows them", () => {
  it("gives an identity's members with the way each was linked and when, in address order, the same from any of them", async () => {
    const s = setup();
    const [a, b] = [wallet(), wallet()];
    await s.link(a, b);
    s.clock.now += MINUTE;
    const expected = [a, b]
      .sort((x, y) => (x.address < y.address ? -1 : 1))
      .map(({ address }) => ({ address, kind: "adena", linkedAt: T0 }));
    expect(s.links.list(a.address)).toEqual(expected);
    expect(s.links.list(b.address)).toEqual(expected);
  });

  it("keeps the command line's kind and each member's own date", async () => {
    const s = setup({ cli: yesFile });
    const [a, key] = [wallet(), cliKey()];
    await s.link(a, wallet());
    s.clock.now += MINUTE;
    const made = s.started(a, { address: key.address }, { kind: "cli" });
    await s.links.finishLink({
      kind: "cli",
      nonce: made.nonce,
      by: a.address,
      address: key.address,
      file: "x",
      host: HOST,
      signedAt: s.clock.now,
    });
    const row = s.links.list(a.address).find(({ address }) => address === key.address);
    expect(row).toEqual({ address: key.address, kind: "cli", linkedAt: T0 + MINUTE });
  });

  it("gives nothing for an address with no link, and never another identity's members", async () => {
    const s = setup();
    const [a, b, c] = [wallet(), wallet(), wallet()];
    await s.link(a, b);
    expect(s.links.list(c.address)).toEqual([]);
    expect(s.links.list(c.address).map(({ address }) => address)).not.toContain(a.address);
  });
});

// The release (D13940, M2): a command-line key's way out of an identity with no session. The code is stateless (an HMAC of the key, the
// host and the expiry, carried in the code): asking writes nothing, so no flood of asks can evict anyone's code; a signed release spends it.
describe("the release of a command-line key", () => {
  const setupCli = (options: Parameters<typeof setup>[0] = {}) => {
    const s = setup({ cli: cliVerify, ...options });
    const startRelease = (key: Pick<CliKey, "address">, over: Partial<Parameters<Links["startRelease"]>[0]> = {}) =>
      s.links.startRelease({ subject: key.address, host: HOST, ...over });
    const released = (key: Pick<CliKey, "address">, over: Partial<Parameters<Links["startRelease"]>[0]> = {}) => {
      const made = startRelease(key, over);
      if (typeof made === "string") throw new Error(`no release code: ${made}`);
      return made;
    };
    const finishRelease = (
      { nonce, text }: { nonce: string; text: string },
      {
        key,
        signer = key,
        memo = text,
        ...over
      }: { key: CliKey; signer?: CliKey; memo?: string } & Partial<Parameters<Links["finishRelease"]>[0]>,
    ) => s.links.finishRelease({ nonce, address: key.address, file: cliFile(signer, memo), host: HOST, ...over });
    // `key` linked to `a` by a command-line proof, the way a phishing victim's key is.
    const linkKey = async (a: Pick<Wallet, "address">, key: CliKey) => {
      const made = s.started(a, { address: key.address }, { kind: "cli" });
      const done = await s.links.finishLink({
        kind: "cli",
        file: cliFile(key, made.text),
        nonce: made.nonce,
        by: a.address,
        address: key.address,
        host: HOST,
        signedAt: T0,
      });
      expect(typeof done).toBe("object");
    };
    // n rows of a kind straight into the table, for a cap too big to fill one call at a time.
    const fill = (n: number, kind: "cli", at = T0 + 10 * MINUTE) =>
      s.db
        .prepare(
          `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?)
           INSERT INTO nonces (nonce, chain, host, text, owner, subject, kind, expires_at)
           SELECT 'fill' || i, ?, ?, 't', 'g1owner', 'g1subject' || i, ?, ? FROM n`,
        )
        .run(n, CHAIN, `link:${HOST}`, kind, at);
    const spent = () => count(s.db, "release_spent");
    return { ...s, startRelease, released, finishRelease, linkKey, fill, spent };
  };

  it("asks for a text that names the key's address and the site, ends on the code, and gives it ten minutes", () => {
    const s = setupCli();
    const key = cliKey();
    const made = s.released(key);
    expect(made.text).toBe(`Unlink ${key.address} from its gnoworld identity on ${HOST}. Code ${made.nonce}`);
    expect(Nonce.safeParse(made.nonce).success).toBe(true);
    expect(made.expiresAt).toBe(new Date(T0 + 10 * MINUTE).toISOString());
  });

  it("carries its expiry and an HMAC of the key, the site and the expiry, under a key derived from the secret, never the secret itself", () => {
    const s = setupCli();
    const key = cliKey();
    const bytes = Buffer.from(s.released(key).nonce, "base64url");
    const expiry = T0 + 10 * MINUTE;
    expect(bytes.readUIntBE(0, 6)).toBe(expiry);
    const mac = (secretKey: string | Buffer) =>
      createHmac("sha256", secretKey)
        .update(`release\n${key.address}\n${HOST}\n${String(expiry)}`)
        .digest()
        .subarray(0, 10);
    const derived = createHmac("sha256", PEPPER).update("gnoworld release code v1").digest();
    expect(bytes.subarray(6)).toEqual(mac(derived));
    expect(bytes.subarray(6)).not.toEqual(mac(PEPPER));
  });

  it("refuses a site that cannot be signed offline", () => {
    const s = setupCli();
    expect(s.startRelease(cliKey(), { host: "gno<world>.test" })).toBe("text");
  });

  it("writes no row at all when asked, however often, so a flood has nothing to fill", () => {
    const s = setupCli();
    for (let at = 0; at < 200; at += 1) s.released(cliKey());
    expect([count(s.db, "nonces"), s.spent()]).toEqual([0, 0]);
  });

  it("asks the same of a linked key and of a free one: a code either way, only the code and the address differ", async () => {
    const s = setupCli();
    const [a, linked, free] = [wallet(), cliKey(), cliKey()];
    await s.linkKey(a, linked);
    const [one, two] = [s.released(linked), s.released(free)];
    expect(one.text.replace(linked.address, "ADDR").replace(one.nonce, "CODE")).toBe(
      two.text.replace(free.address, "ADDR").replace(two.nonce, "CODE"),
    );
    expect(one.expiresAt).toBe(two.expiresAt);
  });

  it("drops a linked key's row and the identity when one member is left, and the other account keeps only itself", async () => {
    const s = setupCli();
    const [a, key] = [wallet(), cliKey()];
    await s.linkKey(a, key);
    expect(await s.finishRelease(s.released(key), { key })).toBe("released");
    expect(count(s.db, "links")).toBe(0);
    expect(count(s.db, "identities")).toBe(0);
    expect(s.links.identityOf(key.address)).toEqual([key.address]);
    expect(s.links.identityOf(a.address)).toEqual([a.address]);
    expect(s.links.list(a.address)).toEqual([]);
  });

  it("drops only the key's row from an identity of three, which stays one of two", async () => {
    const s = setupCli();
    const [a, key, other] = [wallet(), cliKey(), wallet()];
    await s.linkKey(a, key);
    await s.link(a, other);
    expect(await s.finishRelease(s.released(key), { key })).toBe("released");
    expect(s.links.identityOf(a.address).toSorted()).toEqual(addresses(a, other));
    expect(s.links.identityOf(key.address)).toEqual([key.address]);
    consistent(s.db);
  });

  it("releases the linking account itself (the adena-kind row) from three, leaving the other two one identity", async () => {
    const s = setupCli();
    const [a, key, c] = [cliKey(), cliKey(), cliKey()];
    await s.linkKey(a, key);
    await s.linkKey(a, c);
    expect(s.links.identityOf(a.address)).toHaveLength(3);
    expect(await s.finishRelease(s.released(a), { key: a })).toBe("released");
    expect(s.links.identityOf(a.address)).toEqual([a.address]);
    expect(s.links.identityOf(key.address).toSorted()).toEqual([c.address, key.address].toSorted());
    consistent(s.db);
  });

  it("says 'none' for a free key, changing nothing, where a linked key says 'released'", async () => {
    const s = setupCli();
    const [a, linked, free] = [wallet(), cliKey(), cliKey()];
    await s.linkKey(a, linked);
    const before = [count(s.db, "links"), count(s.db, "identities")];
    expect(await s.finishRelease(s.released(free), { key: free })).toBe("none");
    expect([count(s.db, "links"), count(s.db, "identities")]).toEqual(before);
    expect(await s.finishRelease(s.released(linked), { key: linked })).toBe("released");
  });

  it("drops nothing for the signature of another key, and leaves the code to the key it was asked for", async () => {
    const s = setupCli();
    const [a, key, thief] = [wallet(), cliKey(), cliKey()];
    await s.linkKey(a, key);
    const made = s.released(key);
    expect(await s.finishRelease(made, { key, signer: thief })).toBe("proof");
    expect(count(s.db, "links")).toBe(2);
    expect(s.spent()).toBe(0);
    expect(await s.finishRelease(made, { key })).toBe("released");
  });

  it("drops nothing for the signature of another text, even another code's of the same key", async () => {
    const s = setupCli();
    const [a, key] = [wallet(), cliKey()];
    await s.linkKey(a, key);
    const made = s.released(key);
    expect(await s.finishRelease(made, { key, memo: `${made.text} and more` })).toBe("proof");
    expect(await s.finishRelease(made, { key, memo: s.released(key, { host: "other.test" }).text })).toBe("proof");
    s.clock.now += 1;
    expect(await s.finishRelease(made, { key, memo: s.released(key).text })).toBe("proof");
    expect(count(s.db, "links")).toBe(2);
  });

  it("refuses the release, where no command-line verifier is given, so the seam never drops anyone unproved", async () => {
    const s = setup();
    const key = cliKey();
    const made = s.links.startRelease({ subject: key.address, host: HOST });
    if (typeof made === "string") throw new Error(made);
    expect(await s.links.finishRelease({ nonce: made.nonce, address: key.address, file: "", host: HOST })).toBe(
      "proof",
    );
  });

  it("hands the verifier the key's address, the stored chain and the text the code names, never the client's", async () => {
    const seen: Parameters<Verifiers["cli"]>[1][] = [];
    const s = setupCli({
      cli: (_, expected) => {
        seen.push(expected);
        return Promise.resolve(true);
      },
    });
    const key = cliKey();
    const made = s.released(key);
    await s.finishRelease(made, { key, memo: "another text" });
    expect(seen).toEqual([{ signer: key.address, chainId: CHAIN, data: made.text }]);
  });

  it("releases once when two finishes of one code arrive at once: one released, one refused, one spent row", async () => {
    const s = setupCli();
    const [a, key] = [wallet(), cliKey()];
    await s.linkKey(a, key);
    const made = s.released(key);
    const both = await Promise.all([s.finishRelease(made, { key }), s.finishRelease(made, { key })]);
    expect(both.toSorted()).toEqual(["nonce", "released"]);
    expect(s.spent()).toBe(1);
  });

  it("refuses a code replayed after its success, and for a key linked again since", async () => {
    const s = setupCli();
    const [a, key] = [wallet(), cliKey()];
    await s.linkKey(a, key);
    const made = s.released(key);
    expect(await s.finishRelease(made, { key })).toBe("released");
    await s.linkKey(a, key);
    expect(await s.finishRelease(made, { key })).toBe("nonce");
    expect(s.links.identityOf(key.address)).toHaveLength(2);
  });

  it("purges the spent codes once they have expired, and only then", async () => {
    const s = setupCli();
    const [one, two] = [cliKey(), cliKey()];
    await s.finishRelease(s.released(one), { key: one });
    s.clock.now = T0 + 10 * MINUTE - 1;
    await s.finishRelease(s.released(two), { key: two });
    expect(s.spent()).toBe(2);
    s.clock.now = T0 + 10 * MINUTE;
    const three = cliKey();
    await s.finishRelease(s.released(three), { key: three });
    expect(s.spent()).toBe(2);
  });

  it("refuses the code at its tenth minute and not a millisecond before", async () => {
    const s = setupCli();
    const key = cliKey();
    const late = s.released(key);
    s.clock.now = T0 + 10 * MINUTE;
    expect(await s.finishRelease(late, { key })).toBe("nonce");
    s.clock.now = T0 + 10 * MINUTE - 1;
    expect(await s.finishRelease(late, { key })).toBe("none");
  });

  it("refuses the code for another site, and for another address than the one it was made for", async () => {
    const s = setupCli();
    const [key, other] = [cliKey(), cliKey()];
    expect(await s.finishRelease(s.released(key), { key, host: "gnoworld.evil" })).toBe("nonce");
    expect(await s.finishRelease(s.released(key), { key: other })).toBe("nonce");
  });

  it("refuses a code with any one character changed, however its owner signs the memo that names it", async () => {
    const seen: string[] = [];
    const s = setupCli({
      cli: (...args) => {
        seen.push(args[0]);
        return cliVerify(...args);
      },
    });
    const key = cliKey();
    const made = s.released(key);
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    for (let at = 0; at < made.nonce.length; at += 1) {
      for (const char of alphabet) {
        if (char === made.nonce[at]) continue;
        const nonce = `${made.nonce.slice(0, at)}${char}${made.nonce.slice(at + 1)}`;
        const text = made.text.replace(made.nonce, nonce);
        expect(await s.finishRelease({ nonce, text }, { key })).toBe("nonce");
      }
    }
    expect(seen).toEqual([]);
    expect(await s.finishRelease(made, { key })).toBe("none");
  });

  it("refuses a code that is no code: short, long, not base64url", async () => {
    const s = setupCli();
    const key = cliKey();
    for (const nonce of ["", "short", "A".repeat(21), "A".repeat(23), `${"A".repeat(21)}=`, `${"A".repeat(21)}+`]) {
      expect(await s.finishRelease({ nonce, text: `Unlink ${key.address} on ${HOST}. Code ${nonce}` }, { key })).toBe(
        "nonce",
      );
    }
  });

  it("is made with a key of the secret's own: another secret's code is no code here, a fresh database or not", async () => {
    const one = setupCli();
    const key = cliKey();
    const made = one.released(key);
    const db = openDatabase(":memory:", migrations);
    opened.push(db);
    const options = { now: () => T0, chainId: CHAIN, verifiers: { cli: cliVerify } };
    const request = { nonce: made.nonce, address: key.address, file: cliFile(key, made.text), host: HOST };
    const other = makeLinks(db, { ...options, secret: "another-secret-of-forty-characters-0123" });
    expect(await other.finishRelease(request)).toBe("nonce");
    expect(await makeLinks(db, { ...options, secret: PEPPER }).finishRelease(request)).toBe("none");
  });

  describe("kept apart from every other code", () => {
    it("is not a link code: a release code finishes no link, cli or adena", async () => {
      const s = setupCli();
      const [a, key] = [wallet(), cliKey()];
      const release = s.released(key);
      const asLink = { by: a.address, address: key.address, host: HOST, signedAt: T0, nonce: release.nonce };
      expect(await s.links.finishLink({ ...asLink, kind: "cli", file: cliFile(key, release.text) })).toBe("nonce");
      const proof = wallet().sign(CHAIN, release.text);
      expect(await s.links.finishLink({ ...asLink, kind: "adena", proof })).toBe("nonce");
    });

    it("finishes no release with a link's code, cli or adena, which stays spendable as a link", async () => {
      const s = setupCli();
      const [a, key] = [wallet(), cliKey()];
      for (const kind of ["cli", "adena"] as const) {
        const link = s.started(a, { address: key.address }, { kind });
        expect(await s.finishRelease(link, { key })).toBe("nonce");
        expect(count(s.db, "nonces")).toBe(1);
        s.db.prepare("DELETE FROM nonces").run();
      }
      const link = s.started(a, { address: key.address }, { kind: "cli" });
      expect(await s.finishRelease(link, { key })).toBe("nonce");
      const finished = await s.links.finishLink({
        kind: "cli",
        file: cliFile(key, link.text),
        nonce: link.nonce,
        by: a.address,
        address: key.address,
        host: HOST,
        signedAt: T0,
      });
      expect(typeof finished).toBe("object");
      expect(count(s.db, "nonces")).toBe(0);
    });

    it("is spent at no login proof, no admin change and no login", async () => {
      const s = setupCli();
      const [a, key] = [wallet(), cliKey()];
      const made = s.released(key);
      const request = { nonce: made.nonce, address: a.address, proof: a.sign(CHAIN, made.text) };
      expect(await s.signed.prove(request, HOST)).toBe("nonce");
      expect(await s.signed.proveAction(request, HOST)).toBe("nonce");
      expect(await s.login.verify(request, () => true, HOST)).toBe("nonce");
    });

    it("is not spent by a login's nonce, which a release leaves where it is", async () => {
      const s = setupCli();
      const key = cliKey();
      const login = s.login.challenge(CHAIN, HOST);
      if (typeof login === "string") throw new Error(login);
      expect(await s.finishRelease({ nonce: login.nonce, text: login.text }, { key })).toBe("nonce");
      expect(count(s.db, "nonces")).toBe(1);
    });
  });

  describe("the flood that evicted a code", () => {
    it("leaves the key's holder its code and its release after 5000 codes asked by others, for it and for other keys", async () => {
      const s = setupCli();
      const [a, key] = [wallet(), cliKey()];
      await s.linkKey(a, key);
      const mine = s.released(key);
      for (let at = 0; at < 5_000; at += 1) s.released(at % 2 === 0 ? key : cliKey());
      expect(await s.finishRelease(mine, { key })).toBe("released");
      expect(s.links.identityOf(a.address)).toEqual([a.address]);
    });

    it("has no cap of pending codes for one address, and leaves login and link codes their own caps", () => {
      const s = setupCli({ linkCap: 3, nonceCap: 3 });
      for (let at = 0; at < 10; at += 1) s.released(cliKey());
      expect(typeof s.login.challenge(CHAIN, HOST)).toBe("object");
      expect(typeof s.ask(wallet(), wallet())).toBe("object");
    });

    it("has the link's default cap of 20000 pinned, the release having none", () => {
      const t = setupCli();
      t.fill(19_999, "cli");
      expect(typeof t.ask(wallet(), wallet())).toBe("object");
      expect(t.ask(wallet(), wallet())).toBe("full");
    });
  });
});
