// The command-line proof of a link (owners' moderation, part 3): the account signs a transaction to itself, offline, for
// a chain id that exists nowhere. The server rebuilds the signed bytes from its own constants and checks the signature
// over those, never over the paste; every field of the paste but the key and the signature is ignored.
// Sources, gnolang/gno at the chain/onyx tag: tm2/pkg/std/doc.go:96-129 (the bytes), tm2/pkg/sdk/bank/msgs.go:14-18,
// tm2/pkg/crypto/secp256k1/secp256k1.go:121-130 (the address) and secp256k1_nocgo.go:24-59 (R||S, low-S only).
import { ripemd160, Secp256k1, Secp256k1Signature, sha256 } from "@cosmjs/crypto";
import { jsonOf } from "@gnoworld/core";
import { Address, toAddress } from "@gnoworld/schemas";
import { z } from "zod";
import type { Expected } from "./login.ts";

const CLI_CHAIN = "gnoworld-link";
const MAX_FILE = 4096;
const MAX_MEMO = 2000;
// secp256k1's group order: a signature whose S is above half of it is malleable, and the chain refuses it.
const ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

export type CliRefusal = "size" | "shape" | "key" | "signature" | "address";
export type CliResult = { ok: true } | { ok: false; reason: CliRefusal };

export interface SignedDoc {
  chainId: string;
  accountNumber: number;
  sequence: number;
  memo: string;
  from: string;
  to: string;
  amount: string;
  feeAmount: string;
  gas: string;
}

export const isLowS = (s: bigint): boolean => s <= ORDER / 2n;

// Printable ASCII without what Go's JSON escapes (`<`, `>`, `&`): then our JSON and the chain's are the same bytes.
export const cliSafe = (text: string): boolean =>
  /^[\x20-\x7e]*$/.test(text) && !/[<>&]/.test(text) && text.length <= MAX_MEMO;

const sorted = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sorted);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, inner]) => [key, sorted(inner)]),
  );
};

// sign(sortJSON(aminoJSON(signDocPayload))), doc.go:96-129: integers as strings, the fee as {amount: [coin], gas},
// a send's coins as one "1ugnot" string (coin.go:50).
export function signBytes(doc: SignedDoc): Uint8Array {
  const payload = {
    chain_id: doc.chainId,
    account_number: String(doc.accountNumber),
    sequence: String(doc.sequence),
    fee: { amount: [{ denom: "ugnot", amount: doc.feeAmount }], gas: doc.gas },
    msgs: [{ "@type": "/bank.MsgSend", from_address: doc.from, to_address: doc.to, amount: `${doc.amount}ugnot` }],
    memo: doc.memo,
  };
  return new TextEncoder().encode(JSON.stringify(sorted(payload)));
}

const linkDoc = (address: string, memo: string): SignedDoc => ({
  chainId: CLI_CHAIN,
  accountNumber: 0,
  sequence: 0,
  memo,
  from: address,
  to: address,
  amount: "1",
  feeAmount: "1",
  gas: "1",
});

export const addressOf = (pub: Uint8Array): string => toAddress(ripemd160(sha256(pub)));

export function cliDocument(address: Address, memo: string): { document: string; command: string } {
  if (!cliSafe(memo)) throw new RangeError("this text cannot be signed offline");
  const send = { "@type": "/bank.MsgSend", from_address: address, to_address: address, amount: "1ugnot" };
  const document = JSON.stringify({
    msg: [send],
    fee: { gas_wanted: "1", gas_fee: "1ugnot" },
    signatures: null,
    memo,
  });
  const command = `gnokey sign --tx-path link.json --chainid ${CLI_CHAIN} --account-number 0 --account-sequence 0 KEY && cat link.json`;
  return { document, command };
}

// What the person copies: the heredoc that writes the one-line document (no line of it is END), then the sign command.
export function cliBlock(address: Address, memo: string): string {
  const { document, command } = cliDocument(address, memo);
  return `cat > link.json <<'END'\n${document}\nEND\n${command}`;
}

const Entry = z.strictObject({ pub_key: z.unknown(), signature: z.unknown() });
const File = z.strictObject({
  msg: z.array(z.unknown()).length(1),
  fee: z.unknown(),
  memo: z.unknown(),
  signatures: z.array(Entry).length(1),
});
const Key = z.strictObject({ "@type": z.literal("/tm.PubKeySecp256k1"), value: z.string() });

// Bytes of a base64 string only if it is the canonical spelling: Node's decoder skips what is not base64.
const bytesOf = (text: unknown): Buffer | undefined => {
  if (typeof text !== "string") return undefined;
  const bytes = Buffer.from(text, "base64");
  return bytes.toString("base64") === text ? bytes : undefined;
};

const refuse = (reason: CliRefusal): CliResult => ({ ok: false, reason });

// The key and the signature of a paste, or why it is refused; nothing of the paste goes into the reason.
function partsOf(file: string): { pub: Buffer; raw: Buffer } | CliRefusal {
  const entry = File.safeParse(jsonOf(file)).data?.signatures[0];
  if (entry === undefined) return "shape";
  const key = Key.safeParse(entry.pub_key);
  const pub = key.success ? bytesOf(key.data.value) : undefined;
  if (pub?.length !== 33) return "key";
  try {
    Secp256k1.uncompressPubkey(pub);
  } catch {
    return "key";
  }
  const raw = bytesOf(entry.signature);
  return raw?.length === 64 ? { pub, raw } : "signature";
}

function signs(pub: Buffer, raw: Buffer, bytes: Uint8Array): boolean {
  try {
    const s = BigInt(`0x${raw.subarray(32).toString("hex")}`);
    return (
      isLowS(s) &&
      Secp256k1.verifySignature(Secp256k1Signature.fromFixedLength(raw), sha256(bytes), Secp256k1.uncompressPubkey(pub))
    );
  } catch {
    return false;
  }
}

export function verifyCliProof(file: string, { address, memo }: { address: Address; memo: string }): CliResult {
  // Size first, before any parse.
  if (Buffer.byteLength(file) > MAX_FILE) return refuse("size");
  if (!cliSafe(memo)) return refuse("shape");
  const parts = partsOf(file);
  if (typeof parts === "string") return refuse(parts);
  if (!signs(parts.pub, parts.raw, signBytes(linkDoc(address, memo)))) return refuse("signature");
  return addressOf(parts.pub) === address ? { ok: true } : refuse("address");
}

// What `finishLink` calls for the command line: the nonce's subject and its stored text, never the client's.
export const cliVerify = (file: string, { signer, data }: Expected): Promise<boolean> =>
  Promise.resolve(verifyCliProof(file, { address: signer, memo: data }).ok);
