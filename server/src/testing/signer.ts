// A wallet for the tests (decision 141): a secp256k1 key from Node's crypto signs the login text as
// Adena's signArbitrary does, over the document the SDK's own makeArbitrarySignDoc builds. Nothing
// proves Adena signs the same bytes: slice 4's first merge checks it against the real extension.
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { getArbitrarySignBytes, makeArbitrarySignDoc, type SignedArbitraryData } from "@adena-wallet/sdk";
import { Address, toAddress } from "@gnoworld/schemas";

// secp256k1's group order: a signature whose s is above half of it is refused (low-S, BIP-62).
const ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

export interface Wallet {
  address: Address;
  // signer: the address the document names, the key's own unless a test says otherwise.
  sign: (chainId: string, text: string, signer?: string) => SignedArbitraryData;
}

export function wallet(): Wallet {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "secp256k1" });
  const { x = "", y = "" } = publicKey.export({ format: "jwk" });
  const parity = (Buffer.from(y, "base64url").at(-1) ?? 0) & 1;
  const compressed = Buffer.concat([Buffer.from([2 + parity]), Buffer.from(x, "base64url")]);
  const address = Address.parse(toAddress(hash("ripemd160", hash("sha256", compressed))));
  return {
    address,
    sign: (chainId, text, signer = address) => {
      const signed = makeArbitrarySignDoc(chainId, signer, text);
      const signature = sign("sha256", getArbitrarySignBytes(signed), { key: privateKey, dsaEncoding: "ieee-p1363" });
      return {
        signed,
        signature: {
          pubKey: { typeUrl: "/tm.PubKeySecp256k1", value: compressed.toString("base64") },
          signature: lowS(signature).toString("base64"),
        },
      };
    },
  };
}

const hash = (algorithm: string, data: Buffer): Buffer => createHash(algorithm).update(data).digest();

function lowS(signature: Buffer): Buffer {
  const s = BigInt(`0x${signature.subarray(32).toString("hex")}`);
  if (s <= ORDER / 2n) return signature;
  return Buffer.concat([signature.subarray(0, 32), Buffer.from((ORDER - s).toString(16).padStart(64, "0"), "hex")]);
}
