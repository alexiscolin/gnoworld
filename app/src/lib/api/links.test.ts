import { Address } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import type { Fetcher } from "./http.ts";
import { fileShape, FILE_MAX_BYTES, linksApi } from "./links.ts";

// The browser's client of the linked accounts (server/src/login/linkRoutes.ts, mounted at /api/links): each answer read through its schema.
const A = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const B = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const NONCE = "_-09azAZxxxxxxxxxxxxxx";
const EXPIRES = "2026-11-11T10:10:00.000Z";
const LIST = {
  members: [
    { address: A, kind: "adena", linkedAt: 1_762_850_000_000 },
    { address: B, kind: "cli", linkedAt: 1_762_850_000_000 },
  ],
  worlds: ["gnoradio"],
  linked: true,
};
const PROOF = {
  signed: { chain_id: "onyx-1", account_number: "0", sequence: "0", fee: { amount: [], gas: "0" }, msgs: [], memo: "" },
  signature: { pubKey: { typeUrl: "/tm.PubKeySecp256k1", value: "A".repeat(44) }, signature: "A".repeat(88) },
};

const server = (answer: { status: number; json?: unknown }) => {
  const sent: { url: string; init: RequestInit }[] = [];
  const fetcher: Fetcher = (url, init = {}) => {
    sent.push({ url, init });
    const body = answer.json === undefined ? null : JSON.stringify(answer.json);
    return Promise.resolve(
      new Response(body, { status: answer.status, headers: { "content-type": "application/json" } }),
    );
  };
  return { api: linksApi(fetcher), sent };
};
const bodyOf = (call: { init: RequestInit } | undefined): unknown =>
  typeof call?.init.body === "string" ? JSON.parse(call.init.body) : undefined;

describe("the linked accounts, from the server", () => {
  it("asks GET /api/links, the cookie to this site alone, no redirect followed, no body", async () => {
    const { api, sent } = server({ status: 200, json: LIST });
    expect(await api.list()).toEqual({ ok: true, value: LIST });
    expect(sent[0]?.url).toBe("/api/links");
    expect(sent[0]?.init).toMatchObject({ method: "GET", credentials: "same-origin", redirect: "error" });
    expect(sent[0]?.init.body).toBeUndefined();
  });

  it.each([
    ["an address that is none", { ...LIST, members: [{ address: "nope", kind: "adena", linkedAt: 1 }] }],
    ["a kind it does not know", { ...LIST, members: [{ address: A, kind: "ledger", linkedAt: 1 }] }],
    ["a date that is no whole number", { ...LIST, members: [{ address: A, kind: "adena", linkedAt: "now" }] }],
    ["a negative date", { ...LIST, members: [{ address: A, kind: "adena", linkedAt: -1 }] }],
    [
      "eleven members",
      { ...LIST, members: Array.from({ length: 11 }, () => ({ address: A, kind: "adena", linkedAt: 1 })) },
    ],
    ["worlds that are not words", { ...LIST, worlds: [1] }],
    ["no worlds field", { members: LIST.members, linked: true }],
  ])("refuses a list with %s", async (_name, json) => {
    expect(await server({ status: 200, json }).api.list()).toEqual({ ok: false, reason: "malformed" });
  });

  it("asks an Adena code for the account to link, and reads the server's text", async () => {
    const answer = { nonce: NONCE, text: "Link ...", expiresAt: EXPIRES, chainId: "onyx-1" };
    const { api, sent } = server({ status: 200, json: answer });
    expect(await api.adenaChallenge(B)).toEqual({ ok: true, value: answer });
    expect(sent[0]?.url).toBe("/api/links/challenge");
    expect(sent[0]?.init).toMatchObject({ method: "POST", credentials: "same-origin", redirect: "error" });
    expect(bodyOf(sent[0])).toEqual({ kind: "adena", address: B });
  });

  it("asks a command-line code, and keeps the block the server composed", async () => {
    const answer = { nonce: NONCE, memo: "memo", block: "cat > link.json", expiresAt: EXPIRES };
    const { api, sent } = server({ status: 200, json: answer });
    expect(await api.cliChallenge(B)).toEqual({ ok: true, value: answer });
    expect(bodyOf(sent[0])).toEqual({ kind: "cli", address: B });
  });

  it.each([
    ["no block", { nonce: NONCE, memo: "m", expiresAt: EXPIRES }],
    ["an empty block", { nonce: NONCE, memo: "m", block: "", expiresAt: EXPIRES }],
    ["a block of 9 KiB", { nonce: NONCE, memo: "m", block: "x".repeat(9000), expiresAt: EXPIRES }],
    ["a nonce that is none", { nonce: "short", memo: "m", block: "b", expiresAt: EXPIRES }],
    ["a date that is none", { nonce: NONCE, memo: "m", block: "b", expiresAt: "soon" }],
  ])("refuses a command-line code with %s", async (_name, json) => {
    expect(await server({ status: 200, json }).api.cliChallenge(B)).toEqual({ ok: false, reason: "malformed" });
  });

  it("posts Adena's proof with its code and address, and reads the members", async () => {
    const { api, sent } = server({ status: 200, json: { members: [A, B] } });
    expect(await api.verifyAdena({ nonce: NONCE, address: B, proof: PROOF })).toEqual({
      ok: true,
      value: { members: [A, B] },
    });
    expect(sent[0]?.url).toBe("/api/links/verify");
    expect(bodyOf(sent[0])).toEqual({ nonce: NONCE, address: B, proof: PROOF });
  });

  it("posts the pasted file as it is, its address and its code", async () => {
    const { api, sent } = server({ status: 200, json: { members: [A, B] } });
    await api.verifyFile({ nonce: NONCE, address: B, file: '{"msg":[]}' });
    expect(bodyOf(sent[0])).toEqual({ nonce: NONCE, address: B, file: '{"msg":[]}' });
  });

  it("sends no file over 4 KiB, counted in bytes", async () => {
    const { api, sent } = server({ status: 200, json: { members: [A, B] } });
    const big = "é".repeat(FILE_MAX_BYTES / 2 + 1);
    expect(await api.verifyFile({ nonce: NONCE, address: B, file: big })).toEqual({ ok: false, reason: "refused" });
    expect(sent).toHaveLength(0);
  });

  it("refuses a link the server says is done without the account asked", async () => {
    const { api } = server({ status: 200, json: { members: [A] } });
    expect(await api.verifyAdena({ nonce: NONCE, address: B, proof: PROOF })).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("refuses members that are no addresses, and more than ten", async () => {
    expect(
      await server({ status: 200, json: { members: ["x"] } }).api.verifyAdena({
        nonce: NONCE,
        address: B,
        proof: PROOF,
      }),
    ).toEqual({ ok: false, reason: "malformed" });
    const eleven = { members: Array.from({ length: 11 }, () => B) };
    expect(
      await server({ status: 200, json: eleven }).api.verifyAdena({ nonce: NONCE, address: B, proof: PROOF }),
    ).toEqual({ ok: false, reason: "malformed" });
  });

  it("unlinks one address, and reads the members that are left", async () => {
    const { api, sent } = server({ status: 200, json: { members: [A] } });
    expect(await api.unlink(B)).toEqual({ ok: true, value: { members: [A] } });
    expect(sent[0]?.url).toBe("/api/links/unlink");
    expect(bodyOf(sent[0])).toEqual({ address: B });
  });

  it("refuses an unlink the server says left the account in", async () => {
    expect(await server({ status: 200, json: { members: [A, B] } }).api.unlink(B)).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  // The server's words, as the dialog acts on them: a stale session is 401, a full identity 409 "full", the others "refused".
  it.each([
    [401, "unauthenticated"],
    [409, "full"],
    [400, "refused"],
    [429, "too_many"],
    [404, "not_found"],
  ] as const)("reads a %i as %s", async (status, error) => {
    expect(await server({ status, json: { error } }).api.unlink(B)).toMatchObject({ ok: false, reason: error });
  });

  // The verify's refusals, one word each (server/src/login/linkRoutes.ts): a code unknown, expired or used, a proof that is not the account's,
  // an account already in another identity, an identity that is full.
  it.each([
    [404, "not_found"],
    [400, "refused"],
    [403, "forbidden"],
    [409, "full"],
  ] as const)("reads a verify's %i as %s, for Adena's proof and for the file alike", async (status, error) => {
    const answer = { ok: false, reason: error, body: { error } };
    expect(
      await server({ status, json: { error } }).api.verifyAdena({ nonce: NONCE, address: B, proof: PROOF }),
    ).toEqual(answer);
    expect(await server({ status, json: { error } }).api.verifyFile({ nonce: NONCE, address: B, file: "{}" })).toEqual(
      answer,
    );
  });
});

// The file the tool writes is one JSON object with exactly one signature: what is pasted is checked for that before a code is spent on it.
describe("the shape of a pasted file", () => {
  const signed = (signatures: unknown) => JSON.stringify({ msg: [], fee: {}, signatures, memo: "m" });
  it("accepts one JSON object holding exactly one signature", () => {
    expect(fileShape(signed([{ pub_key: {}, signature: "x" }]))).toBe(true);
  });
  it.each([
    ["the unsigned document (signatures null)", signed(null)],
    ["no signature", signed([])],
    ["two signatures", signed([{}, {}])],
    ["signatures that is no list", signed({})],
    ["a JSON list", "[]"],
    ["a JSON string", '"x"'],
    ["terminal noise before the JSON", `$ gnokey sign\n${signed([{}])}`],
    ["nothing", ""],
    ["more than 4 KiB", JSON.stringify({ signatures: [{ pad: "x".repeat(FILE_MAX_BYTES) }] })],
  ])("refuses %s", (_name, text) => {
    expect(fileShape(text)).toBe(false);
  });
});

// The chain the server checks the signature for comes with the Adena code, so the page can compare it with Adena's network before Sign.
describe("an Adena code's chain", () => {
  it.each([
    ["no chain", { nonce: NONCE, text: "t", expiresAt: EXPIRES }],
    ["an empty chain", { nonce: NONCE, text: "t", expiresAt: EXPIRES, chainId: "" }],
    ["a chain of 51 characters", { nonce: NONCE, text: "t", expiresAt: EXPIRES, chainId: "x".repeat(51) }],
  ])("refuses a code with %s", async (_name, json) => {
    expect(await server({ status: 200, json }).api.adenaChallenge(B)).toEqual({ ok: false, reason: "malformed" });
  });
});

// A command-line key's release needs no session: its own two routes, the same block-and-paste proof, an answer that never says whether the key was linked.
describe("the release of a command-line key", () => {
  it("asks POST /api/links/release/challenge for the key's address and keeps the server's block", async () => {
    const answer = { nonce: NONCE, memo: "Unlink", block: "cat > link.json", expiresAt: EXPIRES };
    const { api, sent } = server({ status: 200, json: answer });
    expect(await api.releaseChallenge(B)).toEqual({ ok: true, value: answer });
    expect(sent[0]?.url).toBe("/api/links/release/challenge");
    expect(sent[0]?.init).toMatchObject({ method: "POST", credentials: "same-origin", redirect: "error" });
    expect(bodyOf(sent[0])).toEqual({ address: B });
  });

  it("refuses a release code with no block", async () => {
    const json = { nonce: NONCE, memo: "m", expiresAt: EXPIRES };
    expect(await server({ status: 200, json }).api.releaseChallenge(B)).toEqual({ ok: false, reason: "malformed" });
  });

  it("posts the code, the address and the pasted file to /api/links/release/verify", async () => {
    const { api, sent } = server({ status: 200, json: { ok: true } });
    expect(await api.releaseVerify({ nonce: NONCE, address: B, file: "{}" })).toEqual({
      ok: true,
      value: { ok: true },
    });
    expect(sent[0]?.url).toBe("/api/links/release/verify");
    expect(bodyOf(sent[0])).toEqual({ nonce: NONCE, address: B, file: "{}" });
  });

  it.each([{ ok: false }, {}, { members: [] }])("refuses the verify answer %j", async (json) => {
    expect(await server({ status: 200, json }).api.releaseVerify({ nonce: NONCE, address: B, file: "{}" })).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("sends no file over 4 KiB", async () => {
    const { api, sent } = server({ status: 200, json: { ok: true } });
    const big = "x".repeat(FILE_MAX_BYTES + 1);
    expect(await api.releaseVerify({ nonce: NONCE, address: B, file: big })).toEqual({ ok: false, reason: "refused" });
    expect(sent).toHaveLength(0);
  });

  it.each([
    [404, "not_found"],
    [400, "refused"],
    [429, "too_many"],
  ] as const)("reads a %i as %s", async (status, error) => {
    expect(
      await server({ status, json: { error } }).api.releaseVerify({ nonce: NONCE, address: B, file: "{}" }),
    ).toMatchObject({ ok: false, reason: error });
  });
});
