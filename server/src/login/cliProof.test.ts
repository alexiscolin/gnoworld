import { Random, Secp256k1, Secp256k1Signature, sha256 } from "@cosmjs/crypto";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { cliFile, cliKey, docFor, highS, type CliFileOptions, type CliKey } from "../testing/cliSigner.ts";
import {
  addressOf,
  cliDocument,
  cliSafe,
  cliVerify,
  isLowS,
  signBytes,
  verifyCliProof,
  type CliRefusal,
} from "./cliProof.ts";

const MEMO =
  "Link g1aaa to g1bbb on gnoworld.test. From now on each of them moderates every world the other owns on onyx-1. Code SECRETMEMOMARK";
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

interface Paste {
  who: CliKey;
  memo: string;
  file: string;
}
const paste = (options: CliFileOptions = {}, who: CliKey = cliKey(), memo = MEMO): Paste => ({
  who,
  memo,
  file: cliFile(who, memo, options),
});
const check = (p: Paste, file = p.file) => verifyCliProof(file, { address: p.who.address, memo: p.memo });
const ownSignature = (who: CliKey) => who.sign(signBytes(docFor(who.address, MEMO)));
const keyOf = (type: string, value: Uint8Array) => ({ "@type": type, value: b64(value) });
const secp = "/tm.PubKeySecp256k1";

describe("the fixture itself", () => {
  it("signs low-S, makes high-S that cosmjs still accepts as ECDSA, over 25 keys", () => {
    for (let i = 0; i < 25; i++) {
      const who = cliKey();
      const sig = ownSignature(who);
      const high = highS(sig);
      const s = (bytes: Uint8Array) => BigInt(`0x${Buffer.from(bytes.subarray(32)).toString("hex")}`);
      expect(s(sig) <= ORDER / 2n).toBe(true);
      expect(s(high) > ORDER / 2n).toBe(true);
      expect(
        Secp256k1.verifySignature(
          Secp256k1Signature.fromFixedLength(high),
          sha256(signBytes(docFor(who.address, MEMO))),
          Secp256k1.uncompressPubkey(who.pub),
        ),
      ).toBe(true);
    }
  });
});

describe("the sign bytes against Go's encoder", () => {
  // Written once by Go's encoding/json, run in a scratch directory (the chain's sortJSON, std/utils.go: unmarshal into
  // any, marshal), over the amino JSON of the same document with its keys unsorted:
  //   var c any; json.Unmarshal([]byte(in), &c); out, _ := json.Marshal(c); fmt.Println(string(out))
  it("gives, for a memo holding a quote, a backslash, an apostrophe, a dollar and a backtick, what Go gives", () => {
    const address = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
    const text = new TextDecoder().decode(signBytes(docFor(address, "a\"b\\c'd$e`f")));
    expect(text).toBe(
      '{"account_number":"0","chain_id":"gnoworld-link","fee":{"amount":[{"amount":"1","denom":"ugnot"}],"gas":"1"},"memo":"a\\"b\\\\c\'d$e`f","msgs":[{"@type":"/bank.MsgSend","amount":"1ugnot","from_address":"g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5","to_address":"g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5"}],"sequence":"0"}',
    );
  });
});

describe("a real onyx-1 bank send, the known answer", () => {
  // Transaction jwuk75Nvw6Gay6TFgF03uieDhsRvXAf9TmqyhWRkfdA= at height 1022415 on onyx-1 (gnoscope explain_tx; its raw
  // Amino holds the key and the signature). Account number 999 (gno_account); the sequence 6 was found by trying 0 upward.
  const PUB = "03e16136db171e32df489935941f056e22f89863e3739d0ab7cd49ec42839c9db2";
  const SIG =
    "aa113ab81f2dd80a70ba1eaf5938d823475ade8ec50bb00b94079b2368516d840ba85cf4d047e158598a5d019692e740d58c00add1f2974a0c8946890e818471";
  const FROM = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
  const doc = {
    chainId: "onyx-1",
    accountNumber: 999,
    sequence: 6,
    memo: "",
    from: FROM,
    to: "g1gg8994sq3naa2h5gcs5eveu2j49eyhkkj7r7vv",
    amount: "410000",
    feeAmount: "1000000",
    gas: "10000000",
  };

  it("derives the real address from the real key", () => {
    expect(addressOf(Buffer.from(PUB, "hex"))).toBe(FROM);
  });

  it("verifies the real signature over the bytes the server's own builder makes, and over no other sequence", () => {
    const sig = Secp256k1Signature.fromFixedLength(Buffer.from(SIG, "hex"));
    const pub = Secp256k1.uncompressPubkey(Buffer.from(PUB, "hex"));
    const verifies = (over: Partial<typeof doc>) =>
      Secp256k1.verifySignature(sig, sha256(signBytes({ ...doc, ...over })), pub);
    expect(verifies({})).toBe(true);
    expect([verifies({ sequence: 5 }), verifies({ chainId: "dev" }), verifies({ amount: "410001" })]).toEqual([
      false,
      false,
      false,
    ]);
    expect(isLowS(BigInt(`0x${SIG.slice(64)}`))).toBe(true);
  });
});

describe("isLowS", () => {
  it("accepts half the order and refuses the next number", () => {
    expect([isLowS(1n), isLowS(ORDER / 2n), isLowS(ORDER / 2n + 1n), isLowS(ORDER - 1n)]).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });
});

describe("cliDocument", () => {
  it("writes the block from the server's constants: a send to the key itself, 1ugnot, fee 1ugnot gas 1, chain gnoworld-link", () => {
    const key = cliKey();
    const { document, command } = cliDocument(key.address, MEMO);
    expect(JSON.parse(document)).toEqual({
      msg: [{ "@type": "/bank.MsgSend", from_address: key.address, to_address: key.address, amount: "1ugnot" }],
      fee: { gas_wanted: "1", gas_fee: "1ugnot" },
      signatures: null,
      memo: MEMO,
    });
    expect(command).toBe(
      "gnokey sign --tx-path link.json --chainid gnoworld-link --account-number 0 --account-sequence 0 KEY && cat link.json",
    );
  });

  it("gives one line, none of them END, which the block's heredoc would end on", () => {
    const { document } = cliDocument(cliKey().address, MEMO);
    expect(document.split("\n")).toHaveLength(1);
    expect(document.split("\n")).not.toContain("END");
  });

  it("gives a document that the tool's signature, made over the source's bytes, verifies against", () => {
    const key = cliKey();
    const written = z.record(z.string(), z.unknown()).parse(JSON.parse(cliDocument(key.address, MEMO).document));
    const file = JSON.stringify({
      ...written,
      signatures: [{ pub_key: keyOf(secp, key.pub), signature: b64(ownSignature(key)) }],
    });
    expect(verifyCliProof(file, { address: key.address, memo: MEMO })).toEqual({ ok: true });
  });

  it.each([
    ["a less-than sign", "a<b"],
    ["a greater-than sign", "a>b"],
    ["an ampersand", "a&b"],
    ["U+2028", "a\u2028b"],
    ["U+2029", "a\u2029b"],
    ["a backspace", "a\bb"],
    ["a newline", "a\nb"],
    ["a delete character", "a\u007fb"],
    ["a letter outside ASCII", "café"],
    ["2001 characters", "a".repeat(2001)],
  ])("refuses a memo holding %s, naming none of it, and verifies no proof of it", (_, memo) => {
    const key = cliKey();
    let message = "";
    try {
      cliDocument(key.address, memo);
    } catch (error) {
      message = error instanceof Error ? error.message : "";
    }
    expect(message).not.toBe("");
    expect(message).not.toContain(memo.slice(0, 4));
    expect(verifyCliProof(cliFile(key, memo), { address: key.address, memo })).toEqual({ ok: false, reason: "shape" });
  });
});

describe("verifyCliProof accepts", () => {
  it("the file the tool writes, for 25 throwaway keys", () => {
    for (let i = 0; i < 25; i++) expect(check(paste())).toEqual({ ok: true });
  });

  it("ignores what the paste says of the message, the fee and the memo, since the server rebuilds them", () => {
    const p = paste({ pastedMemo: "something else", top: { msg: [{ anything: 1 }], fee: { gas_wanted: "999" } } });
    expect(check(p)).toEqual({ ok: true });
  });

  it("the tool's pretty-printed file, with CRLF endings and a trailing newline", () => {
    const p = paste();
    const pretty = `${JSON.stringify(JSON.parse(p.file), null, 2).replaceAll("\n", "\r\n")}\r\n`;
    expect(check(p, pretty)).toEqual({ ok: true });
  });

  it("a body of exactly 4 KiB", () => {
    const base = paste();
    const padded = paste({ pastedMemo: " ".repeat(4096 - Buffer.byteLength(base.file) + base.memo.length) }, base.who);
    expect(Buffer.byteLength(padded.file)).toBe(4096);
    expect(check(base, padded.file)).toEqual({ ok: true });
  });
});

describe("verifyCliProof refuses", () => {
  const sized = (extra: number) => {
    const base = paste();
    return paste({ pastedMemo: " ".repeat(extra - Buffer.byteLength(base.file) + base.memo.length) }, base.who);
  };
  const two = (): { who: CliKey; sig: Uint8Array } => {
    const who = cliKey();
    return { who, sig: ownSignature(who) };
  };
  const wrongKey = (value: unknown) => paste({ pubKey: value });
  const sigOf = (signature: Uint8Array | string) => {
    const who = cliKey();
    return paste({ signature: typeof signature === "string" ? Buffer.from(signature) : signature }, who);
  };

  const refused: [string, CliRefusal, () => Paste][] = [
    ["a body of 4 KiB and one byte", "size", () => sized(4097)],
    ["a body of 5 KiB", "size", () => sized(5 * 1024)],
    ["a body of 1 MiB of [, before any parse", "size", () => ({ ...paste(), file: "[".repeat(1024 * 1024) })],
    ["a body of 5 KiB that is not JSON", "size", () => ({ ...paste(), file: "x".repeat(5 * 1024) })],
    [
      "2100 two-byte letters, under 4096 characters and over 4096 bytes",
      "size",
      () => ({ ...paste(), file: "é".repeat(2100) }),
    ],
    ["a second message", "shape", () => paste({ msgs: 2 })],
    ["no message", "shape", () => paste({ msgs: 0 })],
    ["a second signature", "shape", () => paste({ signatures: "two" })],
    ["no signature", "shape", () => paste({ signatures: "none" })],
    ["the unsigned block, signatures null", "shape", () => paste({ top: { signatures: null } })],
    ["signatures holding null", "shape", () => paste({ top: { signatures: [null] } })],
    ["an extra field in the file", "shape", () => paste({ top: { extra: 1 } })],
    [
      "an extra field in the signature, a session_addr",
      "shape",
      () => paste({ signatureExtra: { session_addr: "g1x" } }),
    ],
    ["a file that is not JSON", "shape", () => ({ ...paste(), file: "not json at all" })],
    ["an empty file", "shape", () => ({ ...paste(), file: "" })],
    ["JSON that is not an object", "shape", () => ({ ...paste(), file: "[1,2]" })],
    [
      "a multisig key",
      "key",
      () => wrongKey({ "@type": "/tm.PubKeyMultisig", threshold: "1", pubkeys: [keyOf(secp, cliKey().pub)] }),
    ],
    ["an ed25519 type", "key", () => wrongKey(keyOf("/tm.PubKeyEd25519", Random.getBytes(32)))],
    ["a valid secp256k1 key labelled ed25519", "key", () => wrongKey(keyOf("/tm.PubKeyEd25519", cliKey().pub))],
    ["a valid secp256k1 key labelled multisig", "key", () => wrongKey(keyOf("/tm.PubKeyMultisig", cliKey().pub))],
    ["a pub_key with no type", "key", () => wrongKey({ value: b64(cliKey().pub) })],
    ["a null pub_key", "key", () => wrongKey(null)],
    [
      "a pub_key of 65 bytes, the uncompressed form",
      "key",
      () => {
        const who = cliKey();
        return paste({ pubKey: keyOf(secp, Secp256k1.uncompressPubkey(who.pub)) }, who);
      },
    ],
    [
      "a pub_key with an extra field",
      "key",
      () => {
        const who = cliKey();
        return paste({ pubKey: { ...keyOf(secp, who.pub), extra: 1 } }, who);
      },
    ],
    ["a key of 33 zero bytes", "key", () => wrongKey(keyOf(secp, new Uint8Array(33)))],
    [
      "a key with the prefix 5",
      "key",
      () => wrongKey(keyOf(secp, Buffer.concat([Buffer.from([5]), cliKey().pub.subarray(1)]))),
    ],
    [
      "a key whose x is above the field's prime",
      "key",
      () => wrongKey(keyOf(secp, Buffer.alloc(33, 255).fill(2, 0, 1))),
    ],
    ["a key value that is not a string", "key", () => wrongKey({ "@type": secp, value: 7 })],
    [
      "a key value with a newline inside its base64",
      "key",
      () => {
        const who = cliKey();
        const text = b64(who.pub);
        return paste({ pubKey: { "@type": secp, value: `${text.slice(0, 10)}\n${text.slice(10)}` } }, who);
      },
    ],
    ["a signature over a tampered memo", "signature", () => paste({ doc: { memo: `${MEMO}!` } })],
    ["a signature over a tampered amount", "signature", () => paste({ doc: { amount: "2" } })],
    ["a signature over a tampered fee", "signature", () => paste({ doc: { feeAmount: "2" } })],
    ["a signature over a tampered gas", "signature", () => paste({ doc: { gas: "2" } })],
    ["a signature over a tampered sequence", "signature", () => paste({ doc: { sequence: 1 } })],
    ["a signature over a tampered account number", "signature", () => paste({ doc: { accountNumber: 1 } })],
    ["a signature over another chain id", "signature", () => paste({ doc: { chainId: "gnoworld-link2" } })],
    ["a signature over the tool's default chain id dev", "signature", () => paste({ doc: { chainId: "dev" } })],
    ["a signature over the chain id onyx-1", "signature", () => paste({ doc: { chainId: "onyx-1" } })],
    ["a signature over the chain id gnoland-1", "signature", () => paste({ doc: { chainId: "gnoland-1" } })],
    ["a signature over a send to another address", "signature", () => paste({ doc: { to: cliKey().address } })],
    [
      "a signature of 65 bytes, a recovery byte after S",
      "signature",
      () => {
        const { who, sig } = two();
        return paste({ signature: Buffer.concat([sig, Buffer.from([1])]) }, who);
      },
    ],
    [
      "a signature of 63 bytes",
      "signature",
      () => {
        const { who, sig } = two();
        return paste({ signature: sig.subarray(1) }, who);
      },
    ],
    [
      "a high-S signature, valid as ECDSA",
      "signature",
      () => {
        const { who, sig } = two();
        return paste({ signature: highS(sig) }, who);
      },
    ],
    ["a signature of 64 zero bytes", "signature", () => sigOf(new Uint8Array(64))],
    ["a signature of 64 bytes of 255", "signature", () => sigOf(new Uint8Array(64).fill(255))],
    [
      "a signature whose R is the order",
      "signature",
      () => sigOf(Buffer.concat([Buffer.from(ORDER.toString(16), "hex"), Buffer.alloc(31), Buffer.from([1])])),
    ],
    [
      "a signature that is not a string",
      "signature",
      () => paste({ top: { signatures: [{ pub_key: keyOf(secp, cliKey().pub), signature: 7 }] } }),
    ],
    [
      "a signature with a marker and a bang in its base64",
      "signature",
      () => {
        const who = cliKey();
        return paste({ top: { signatures: [{ pub_key: keyOf(secp, who.pub), signature: "SECRETSIGMARK!!" }] } }, who);
      },
    ],
    [
      "a pub_key of another address, with that key's own valid signature",
      "address",
      () => {
        const [owner, other] = [cliKey(), cliKey()];
        return {
          who: owner,
          memo: MEMO,
          file: cliFile(other, MEMO, { doc: { from: owner.address, to: owner.address } }),
        };
      },
    ],
  ];

  it.each(refused.map(([fault]) => fault))("%s, for its reason, with no byte of the paste in the answer", (fault) => {
    const row = refused.find(([name]) => name === fault);
    if (row === undefined) throw new Error("no such fault");
    const [, reason, build] = row;
    const p = build();
    let result: ReturnType<typeof check> | undefined;
    expect(() => {
      result = check(p);
    }).not.toThrow();
    expect(result).toEqual({ ok: false, reason });
    const answer = JSON.stringify(result);
    const secrets = [
      p.memo,
      /"signature":"([^"]+)"/.exec(p.file)?.[1] ?? "",
      /"value":"([^"]+)"/.exec(p.file)?.[1] ?? "",
    ];
    for (const secret of [...secrets, p.who.address].filter((text) => text !== ""))
      expect(answer).not.toContain(secret.slice(0, 12));
    expect(answer).not.toContain("SECRET");
    expect(answer.length).toBeLessThan(60);
  });

  it("a proof for another address than the one the code was issued for", () => {
    const p = paste();
    expect(verifyCliProof(p.file, { address: cliKey().address, memo: MEMO })).toEqual({
      ok: false,
      reason: "signature",
    });
  });

  it("the file of one code against another code's memo", () => {
    const p = paste();
    expect(verifyCliProof(p.file, { address: p.who.address, memo: `${MEMO} other` })).toEqual({
      ok: false,
      reason: "signature",
    });
  });
});

describe("cliVerify, the binding the link seam calls", () => {
  it("takes the subject as the address and the stored text as the memo, and says only yes or no", async () => {
    const p = paste();
    expect(await cliVerify(p.file, { signer: p.who.address, chainId: "onyx-1", data: MEMO })).toBe(true);
    expect(await cliVerify(p.file, { signer: p.who.address, chainId: "onyx-1", data: `${MEMO}x` })).toBe(false);
    expect(await cliVerify(p.file, { signer: cliKey().address, chainId: "onyx-1", data: MEMO })).toBe(false);
  });
});

describe("cliSafe, the text that can be signed offline (the mutants of slice 13)", () => {
  it("takes a memo of 2000 characters and refuses one of 2001", () => {
    expect(cliSafe("a".repeat(2000))).toBe(true);
    expect(cliSafe("a".repeat(2001))).toBe(false);
  });
});
