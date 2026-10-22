import { describe, expect, it } from "vitest";
import { ChallengeRequest, VerifyRequest } from "./login.ts";

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
  it.each(["onyx-1", "c".repeat(50)])("takes the chain %s", (chainId) => {
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
});
