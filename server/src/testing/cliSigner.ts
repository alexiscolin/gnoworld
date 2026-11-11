// A throwaway command-line key for the tests (owners' moderation, part 3): a secp256k1 key from @cosmjs/crypto's own
// random at each run, never a key in a file. It writes the file the tool leaves after signing, over the server's own
// `signBytes`; the bytes themselves are pinned apart, by a golden test against Go's encoder and a real onyx-1 signature.
import { Random, ripemd160, Secp256k1, sha256 } from "@cosmjs/crypto";
import { Address, toAddress } from "@gnoworld/schemas";
import { signBytes, type SignedDoc } from "../login/cliProof.ts";
import { ORDER } from "./signer.ts";

export type CliDoc = SignedDoc;

export const docFor = (address: string, memo: string): CliDoc => ({
  chainId: "gnoworld-link",
  accountNumber: 0,
  sequence: 0,
  memo,
  amount: "1",
  from: address,
  to: address,
  feeAmount: "1",
  gas: "1",
});

export interface CliKey {
  address: Address;
  pub: Uint8Array;
  // R || S, 64 bytes, low-S, over SHA-256 of `bytes`.
  sign: (bytes: Uint8Array) => Uint8Array;
}

export function cliKey(): CliKey {
  const { privkey, pubkey } = Secp256k1.makeKeypair(Random.getBytes(32));
  const pub = Secp256k1.compressPubkey(pubkey);
  const address = Address.parse(toAddress(ripemd160(sha256(pub))));
  const sign = (bytes: Uint8Array): Uint8Array => {
    const signature = Secp256k1.createSignature(sha256(bytes), privkey);
    return Buffer.concat([signature.r(32), signature.s(32)]);
  };
  return { address, pub, sign };
}

// The same signature with S turned to N - S: still a valid ECDSA signature, but not in low-S form.
export function highS(signature: Uint8Array): Uint8Array {
  const s = BigInt(`0x${Buffer.from(signature.subarray(32)).toString("hex")}`);
  return Buffer.concat([signature.subarray(0, 32), Buffer.from((ORDER - s).toString(16).padStart(64, "0"), "hex")]);
}

export interface CliFileOptions {
  // The document actually signed, when it is not the one the server writes.
  doc?: Partial<CliDoc>;
  // The signature (default: the key's own over the signed document) and the pub_key object, replaced whole.
  signature?: Uint8Array;
  pubKey?: unknown;
  // Anything else the file holds, merged over the tool's four keys; a signature's own extra keys.
  top?: Record<string, unknown>;
  signatureExtra?: Record<string, unknown>;
  signatures?: "none" | "two";
  msgs?: number;
  // Written in the file's memo field (the server ignores it); the signed memo is `doc.memo`.
  pastedMemo?: string;
}

// The file the tool leaves after `sign --tx-path link.json`: the tx with the signature added (sign.go:194-216, tx.go:23-28).
export function cliFile(key: CliKey, memo: string, options: CliFileOptions = {}): string {
  const doc = { ...docFor(key.address, memo), ...options.doc };
  const signature = {
    pub_key:
      "pubKey" in options
        ? options.pubKey
        : { "@type": "/tm.PubKeySecp256k1", value: Buffer.from(key.pub).toString("base64") },
    signature: Buffer.from(options.signature ?? key.sign(signBytes(doc))).toString("base64"),
    ...options.signatureExtra,
  };
  const msg = { "@type": "/bank.MsgSend", from_address: doc.from, to_address: doc.to, amount: `${doc.amount}ugnot` };
  return JSON.stringify({
    msg: Array.from({ length: options.msgs ?? 1 }, () => msg),
    fee: { gas_wanted: doc.gas, gas_fee: `${doc.feeAmount}ugnot` },
    signatures:
      options.signatures === "none" ? [] : options.signatures === "two" ? [signature, signature] : [signature],
    memo: options.pastedMemo ?? memo,
    ...options.top,
  });
}
