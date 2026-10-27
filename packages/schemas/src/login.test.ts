import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Challenge, ChallengeRequest, Me, Nonce, VerifyRequest } from "./login.ts";

const ADDRESS = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
// Adena's answer to signArbitrary, in the shape the SDK types it (SignedArbitraryData); the values are
// only of the right size: these tests read shapes, the server's verify the signature.
const PROOF = {
  signed: {
    chain_id: "onyx-1",
    account_number: "0",
    sequence: "0",
    fee: { amount: [], gas: "0" },
    msgs: [{ type: "sign/MsgSignData", value: { signer: ADDRESS, data: "U2lnbiBpbg==" } }],
    memo: "",
  },
  signature: {
    pubKey: { typeUrl: "/tm.PubKeySecp256k1", value: "A".repeat(44) },
    signature: "A".repeat(88),
  },
};
const VERIFY = { nonce: "A".repeat(22), address: ADDRESS, proof: PROOF };

describe("ChallengeRequest", () => {
  it.each(["onyx-1", "c", "c".repeat(50)])("takes the chain %s", (chainId) => {
    expect(ChallengeRequest.parse({ chainId })).toEqual({ chainId });
  });

  it.each([{}, { chainId: "" }, { chainId: "c".repeat(51) }, { chainId: 1 }, { chainId: "onyx-1", debug: true }])(
    "refuses %j",
    (body) => {
      expect(ChallengeRequest.safeParse(body).success).toBe(false);
    },
  );
});

describe("VerifyRequest", () => {
  it("takes Adena's proof as it comes, and a nonce of 22 base64url characters", () => {
    expect(VerifyRequest.parse(VERIFY)).toEqual(VERIFY);
    expect(VerifyRequest.parse({ ...VERIFY, nonce: "_-09azAZxxxxxxxxxxxxxx" })).toMatchObject({
      nonce: "_-09azAZxxxxxxxxxxxxxx",
    });
  });

  const signature = (change: object) => ({
    ...VERIFY,
    proof: { ...PROOF, signature: { ...PROOF.signature, ...change } },
  });
  const pubKey = (change: object) => signature({ pubKey: { ...PROOF.signature.pubKey, ...change } });
  const signed = (change: object) => ({ ...VERIFY, proof: { ...PROOF, signed: { ...PROOF.signed, ...change } } });
  it.each([
    ["a nonce of 21 characters", { ...VERIFY, nonce: "A".repeat(21) }],
    ["a nonce of 23 characters", { ...VERIFY, nonce: "A".repeat(23) }],
    ["a nonce with a character base64url leaves out", { ...VERIFY, nonce: `${"A".repeat(21)}%` }],
    ["an address with a bad checksum", { ...VERIFY, address: `${ADDRESS.slice(0, -1)}q` }],
    ["a field it does not know", { ...VERIFY, debug: true }],
    ["a public key over 64 characters", pubKey({ value: "A".repeat(65) })],
    ["a key type over 64 characters", pubKey({ typeUrl: "/".repeat(65) })],
    ["a signature over 128 characters", signature({ signature: "A".repeat(129) })],
    ["a chain over 50 characters", signed({ chain_id: "c".repeat(51) })],
    ["a memo over 256 characters", signed({ memo: "m".repeat(257) })],
    ["more than 4 messages", signed({ msgs: [{}, {}, {}, {}, {}] })],
    [
      "more than 4 coins in the fee",
      signed({ fee: { gas: "0", amount: Array.from({ length: 5 }, () => ({ denom: "ugnot", amount: "1" })) } }),
    ],
    ["no signature", { ...VERIFY, proof: { signed: PROOF.signed } }],
  ])("refuses %s", (_, body) => {
    expect(VerifyRequest.safeParse(body).success).toBe(false);
  });

  // Every bound of the proof, at its limit and one past: StrykerJS cannot judge a schema built at import (F412).
  const coin = { denom: "ugnot", amount: "1" };
  const text = (n: number): string => "a".repeat(n);
  const bounds: [string, number, (n: number) => object][] = [
    ["the chain", 50, (n) => signed({ chain_id: text(n) })],
    ["the account number", 20, (n) => signed({ account_number: text(n) })],
    ["the sequence", 20, (n) => signed({ sequence: text(n) })],
    ["the gas", 20, (n) => signed({ fee: { amount: [], gas: text(n) } })],
    ["a coin's denomination", 64, (n) => signed({ fee: { amount: [{ ...coin, denom: text(n) }], gas: "0" } })],
    ["a coin's amount", 64, (n) => signed({ fee: { amount: [{ ...coin, amount: text(n) }], gas: "0" } })],
    ["the coins", 4, (n) => signed({ fee: { amount: Array.from({ length: n }, () => coin), gas: "0" } })],
    ["the messages", 4, (n) => signed({ msgs: Array.from({ length: n }, () => ({})) })],
    ["the memo", 256, (n) => signed({ memo: text(n) })],
    ["the key type", 64, (n) => pubKey({ typeUrl: text(n) })],
    ["the public key", 64, (n) => pubKey({ value: text(n) })],
    ["the signature", 128, (n) => signature({ signature: text(n) })],
  ];
  it.each(bounds)("takes %s at %i characters or items, and refuses one more", (_, max, body) => {
    expect(VerifyRequest.safeParse(body(max)).success).toBe(true);
    expect(VerifyRequest.safeParse(body(max + 1)).success).toBe(false);
  });
});

describe("Me", () => {
  it("names the account logged in, or nobody", () => {
    expect(Me.parse({ address: ADDRESS })).toEqual({ address: ADDRESS });
    expect(Me.parse({ address: null })).toEqual({ address: null });
  });

  it.each([{}, { address: undefined }, { address: "cosmos1x" }, { address: "" }])("refuses %j", (body) => {
    expect(Me.safeParse(body).success).toBe(false);
  });
});

// F673: one nonce schema, the server's challenge and the browser's proof read alike.
describe("Nonce", () => {
  const CHALLENGE = { nonce: "_-09azAZxxxxxxxxxxxxxx", text: "Sign in", expiresAt: "2026-10-25T10:00:00.000Z" };

  it("is a challenge's nonce", () => {
    expect(Challenge.parse(CHALLENGE).nonce).toBe(Nonce.parse(CHALLENGE.nonce));
  });

  it("is a proof's nonce", () => {
    expect(VerifyRequest.parse({ ...VERIFY, nonce: CHALLENGE.nonce }).nonce).toBe(CHALLENGE.nonce);
  });

  // The server writes 16 random bytes in base64url (server/src/login/login.ts).
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const base64url = (bytes: Uint8Array) => {
    let [held, bits, out] = [0, 0, ""];
    for (const byte of bytes) {
      held = ((held << 8) | byte) & 0xffff;
      bits += 8;
      for (; bits >= 6; bits -= 6) out += ALPHABET.charAt((held >> (bits - 6)) & 63);
    }
    return bits > 0 ? out + ALPHABET.charAt((held << (6 - bits)) & 63) : out;
  };

  it("takes any nonce the server writes", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 16, maxLength: 16 }), (bytes) => {
        expect(Nonce.safeParse(base64url(bytes)).success).toBe(true);
      }),
    );
  });

  it.each([
    "A".repeat(21),
    "A".repeat(23),
    `${"A".repeat(21)}%`,
    "",
    `${"A".repeat(22)}\n`,
    null,
    22,
    ["A".repeat(22)],
  ])("refuses a nonce %j in a challenge and in a proof", (nonce) => {
    expect(Challenge.safeParse({ ...CHALLENGE, nonce }).success).toBe(false);
    expect(VerifyRequest.safeParse({ ...VERIFY, nonce }).success).toBe(false);
  });
});
