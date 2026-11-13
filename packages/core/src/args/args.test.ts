import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import * as core from "../index.ts";
import { callArgs, callFields, HIDDEN, isCarried, realmType, textProblem } from "./args.ts";

// A call's arguments follow its parameters' types (ADR-0002 §4). The rules are gno's own `convert.go`
// (gnolang/gno 07e44776c261, tag v1.5.1, the version onyx-1 and gnoland-1 run), read as `vm/qfuncs` writes the types
// (keeper.go:1795: each type is its base) and kept canonical: stricter than Go where Go is lenient, never looser.

const cur = () => ({ Name: "cur", Type: realmType() });
const param = (type: string, name = "x") => ({ Name: name, Type: type });
// A last `[]uint8` may be `...byte` (answer 9c-1): each kind is judged before a last bool.
const call = (type: string, text: string) => {
  const done = callArgs([cur(), param(type), param("bool", "end")], [text, "true"]);
  return done.ok ? { ok: true as const, args: done.args.slice(0, -1) } : done;
};
const problemOf = (type: string, text: string) => {
  const done = call(type, text);
  if (done.ok || done.why !== "fields") return "none";
  return done.problems[0];
};
const accepts = (type: string, text: string) => call(type, text).ok;

const WIDTHS: [string, number, boolean][] = [
  ["int", 64, true],
  ["int8", 8, true],
  ["int16", 16, true],
  ["int32", 32, true],
  ["int64", 64, true],
  ["uint", 64, false],
  ["uint8", 8, false],
  ["uint16", 16, false],
  ["uint32", 32, false],
  ["uint64", 64, false],
];
const bounds = (bits: number, signed: boolean): [bigint, bigint] =>
  signed ? [-(2n ** BigInt(bits - 1)), 2n ** BigInt(bits - 1) - 1n] : [0n, 2n ** BigInt(bits) - 1n];
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
// RFC 4648 §4, written out here so no platform's encoder stands in for the oracle.
const b64 = (bytes: Uint8Array) => {
  let out = "";
  for (let at = 0; at < bytes.length; at += 3) {
    const group = ((bytes[at] ?? 0) << 16) | ((bytes[at + 1] ?? 0) << 8) | (bytes[at + 2] ?? 0);
    out += [18, 12, 6, 0].map((shift) => ALPHABET.charAt((group >> shift) & 63)).join("");
  }
  const pad = (3 - (bytes.length % 3)) % 3;
  return out.slice(0, out.length - pad) + "=".repeat(pad);
};
// Text that is malformed on purpose: code units drawn around the surrogate range, so lone surrogates are common.
const anyText = () =>
  fc.oneof(
    fc.string({ unit: "binary" }),
    fc.array(fc.integer({ min: 0xd7f0, max: 0xe010 }), { maxLength: 8 }).map((units) => String.fromCharCode(...units)),
  );

describe("the realm type", () => {
  it("is the long interface string vm/qfuncs writes for `cur realm`, sealed", () => {
    expect(realmType()).toBe(
      "interface {.seal func(); Address func() .uverse.address; IsCode func() bool; IsCurrent func() bool; " +
        "IsEphemeral func() bool; IsUser func() bool; IsUserCall func() bool; IsUserRun func() bool; PkgPath func() string; " +
        "Previous func() .uverse.realm; String func() string; Sub func(string) .uverse.realm; Subpath func() string}",
    );
  });
});

describe("isCarried", () => {
  it.each([
    "bool",
    "string",
    "int",
    "int8",
    "int16",
    "int32",
    "int64",
    "uint",
    "uint8",
    "uint16",
    "uint32",
    "uint64",
    "float32",
    "float64",
    "[]uint8",
    "[32]uint8",
    "[1]uint8",
  ])("carries %s", (type) => {
    expect(isCarried(type)).toBe(true);
  });

  it.each([
    "address",
    "byte",
    "rune",
    "bigint",
    "[]string",
    "[]int",
    "[3]int",
    "[]uint16",
    "[x]uint8",
    "[3]uint8x",
    "x[3]uint8",
    "[007]uint8",
    "[-1]uint8",
    "[1.5]uint8",
    "[ ]uint8",
    "[99999999999999999999]uint8",
    "[]uint8 ",
    " string",
    "String",
    "*string",
    "map[string]string",
    "func()",
    "struct{}",
    "",
  ])("does not carry %j", (type) => {
    expect(isCarried(type)).toBe(false);
  });

  it("does not carry the realm type", () => {
    expect(isCarried(realmType())).toBe(false);
  });
});

describe("callFields", () => {
  it.each([null, undefined, []])("is a read function, not a call, when its parameters are %j", (params) => {
    expect(callFields(params)).toEqual({ ok: false, why: "read" });
  });

  it("is a read function when the first parameter is not the realm", () => {
    expect(callFields([param("string"), param("int")])).toEqual({ ok: false, why: "read" });
    expect(callFields([param(`${realmType()} `)])).toEqual({ ok: false, why: "read" });
  });

  it("is a read function, before any type is judged, when the first parameter is not the realm", () => {
    expect(callFields([param("bigint"), param("[]string")])).toEqual({ ok: false, why: "read" });
  });

  it("gives no field for a function with the realm alone", () => {
    expect(callFields([cur()])).toEqual({ ok: true, fields: [] });
    expect(callArgs([cur()], [])).toEqual({ ok: true, args: [] });
  });

  it.each([
    "bigint",
    "[]string",
    "[]int",
    "[3]int",
    "[]uint16",
    "map[string]int",
    "*string",
    "func()",
    "struct{}",
    "address ",
  ])("opens the whole call in gnoweb for a parameter of type %j, drawing no field", (type) => {
    const params = [cur(), param("string", "a"), param(type, "b"), param("int", "c")];
    expect(callFields(params)).toEqual({ ok: false, why: "gnoweb" });
    expect(callArgs(params, ["", "", ""])).toEqual({ ok: false, why: "gnoweb" });
  });

  it("names every field after its parameter, in order, leaving the realm out", () => {
    const fields = callFields([cur(), param("string", "name"), param("int64", "amount"), param("bool", "on")]);
    expect(fields).toEqual({
      ok: true,
      fields: [
        { name: "name", type: "string", kind: "string", freeText: true },
        { name: "amount", type: "int64", kind: "integer", freeText: false },
        { name: "on", type: "bool", kind: "bool", freeText: false },
      ],
    });
  });

  it("gives each kind: free text for strings only, a length for [N]uint8 only", () => {
    const kindOf = (type: string) => {
      const done = callFields([cur(), param(type), param("bool", "end")]);
      return done.ok ? done.fields[0] : undefined;
    };
    for (const [type] of WIDTHS) expect(kindOf(type)).toEqual({ name: "x", type, kind: "integer", freeText: false });
    expect(kindOf("float32")).toEqual({ name: "x", type: "float32", kind: "float", freeText: false });
    expect(kindOf("float64")).toEqual({ name: "x", type: "float64", kind: "float", freeText: false });
    expect(kindOf("[]uint8")).toEqual({ name: "x", type: "[]uint8", kind: "bytes", freeText: false });
    expect(kindOf("[32]uint8")).toEqual({ name: "x", type: "[32]uint8", kind: "bytes", freeText: false, length: 32 });
    expect(kindOf("[7]uint8")).toMatchObject({ length: 7 });
    expect(kindOf("string")).toMatchObject({ kind: "string", freeText: true });
    expect(kindOf("[]uint8")).not.toHaveProperty("length");
  });

  it("opens a call whose array length is no safe integer in gnoweb", () => {
    const params = [cur(), param("[99999999999999999999]uint8")];
    expect(callFields(params)).toEqual({ ok: false, why: "gnoweb" });
  });

  it("opens in gnoweb a call whose last parameter is []uint8, which may be `...byte` (answer 9c-1, F5686)", () => {
    for (const params of [
      [cur(), param("[]uint8")],
      [cur(), param("string", "a"), param("[]uint8", "b")],
      [cur(), param("[]uint8", "a"), param("[]uint8", "b")],
    ]) {
      expect(callFields(params)).toEqual({ ok: false, why: "gnoweb" });
      expect(
        callArgs(
          params,
          params.slice(1).map(() => ""),
        ),
      ).toEqual({ ok: false, why: "gnoweb" });
    }
    expect(callFields([cur(), param("[]uint8", "a"), param("int", "b")]).ok).toBe(true);
    expect(callFields([cur(), param("int", "a"), param("[32]uint8", "b")]).ok).toBe(true);
  });

  it("takes as bytes a []uint8 text the chain could read as a uint8, once no []uint8 field can be variadic (F5686)", () => {
    for (const text of ["0000", "0042", "0255", "00000042"]) expect(accepts("[]uint8", text)).toBe(true);
  });

  it("never throws, whatever the types", () => {
    fc.assert(
      fc.property(fc.array(fc.string(), { maxLength: 4 }), (types) => {
        expect(() => callFields(types.map((type) => param(type)))).not.toThrow();
      }),
    );
  });
});

describe("callArgs", () => {
  it("gives the texts unchanged as the arguments, in order", () => {
    const params = [cur(), param("string"), param("int8"), param("[]uint8"), param("bool")];
    const texts = [" two  spaces\n", "-12", "AAAA", "true"];
    expect(callArgs(params, texts)).toEqual({ ok: true, args: texts });
  });

  it("throws a RangeError, a caller's bug, when the texts are not as many as the fields", () => {
    const params = [cur(), param("string"), param("int")];
    expect(() => callArgs(params, ["a"])).toThrow(RangeError);
    expect(() => callArgs(params, ["a"])).toThrow("a text for each field");
    expect(() => callArgs(params, ["a", "1", "2"])).toThrow(RangeError);
    expect(() => callArgs(params, [])).toThrow(RangeError);
    expect(() => callArgs([cur()], ["a"])).toThrow(RangeError);
  });

  it("gives its reason for a function that is no call, or has a type no call carries", () => {
    expect(callArgs([param("string")], ["a"])).toEqual({ ok: false, why: "read" });
    expect(callArgs(null, [])).toEqual({ ok: false, why: "read" });
    expect(callArgs([cur(), param("[]string")], ["a"])).toEqual({ ok: false, why: "gnoweb" });
  });

  it("gives one problem per field, undefined where the text is good, else the rule it breaks", () => {
    const params = [cur(), param("bool", "a"), param("uint8", "b"), param("string", "c"), param("int", "d")];
    const done = callArgs(params, ["true", "256", "ok", "1e3"]);
    expect(done).toEqual({ ok: false, why: "fields", problems: [undefined, "range", undefined, "format"] });
  });

  it("is ok only when every field is good", () => {
    const params = [cur(), param("bool"), param("int")];
    expect(accepts("bool", "true")).toBe(true);
    expect(callArgs(params, ["true", "5"]).ok).toBe(true);
    expect(callArgs(params, ["nope", "5"]).ok).toBe(false);
    expect(callArgs(params, ["true", "five"]).ok).toBe(false);
  });

  it("never throws for a right count, whatever the texts and types", () => {
    const types = [...WIDTHS.map(([type]) => type), "bool", "string", "float32", "float64", "[]uint8", "[4]uint8"];
    fc.assert(
      fc.property(fc.constantFrom(...types), anyText(), (type, text) => {
        expect(() => call(type, text)).not.toThrow();
      }),
    );
  });
});

describe("bool", () => {
  it.each(["true", "false"])("takes %j", (text) => {
    expect(accepts("bool", text)).toBe(true);
  });

  it.each(["True", "TRUE", "False", "1", "0", "t", "f", "yes", "", " true", "true ", "true\n", "tru"])(
    "refuses %j, which Go's ParseBool or a reader might take and convert.go does not",
    (text) => {
      expect(problemOf("bool", text)).toBe("format");
    },
  );
});

describe("string", () => {
  it.each(["", " ", "  a  ", "\n", "a\nb\r\n", "\t", "0x10", "+1", "1e3", "\u0000", "é", "日本語", "😀", "<script>"])(
    "takes %j unchanged, free text as it is",
    (text) => {
      expect(call("string", text)).toEqual({ ok: true, args: [text] });
    },
  );

  it.each([
    String.fromCharCode(0xd800),
    String.fromCharCode(0xdc00),
    `a${String.fromCharCode(0xd83d)}`,
    `${String.fromCharCode(0xde00)}b`,
    `${String.fromCharCode(0xdc00)}${String.fromCharCode(0xd800)}`,
  ])("refuses the lone surrogate in %j, which the wire would send as U+FFFD", (text) => {
    expect(problemOf("string", text)).toBe("malformed");
  });

  it("takes exactly the well-formed strings, and keeps them unchanged", () => {
    let refused = 0;
    let taken = 0;
    fc.assert(
      fc.property(anyText(), (text) => {
        const done = call("string", text);
        expect(done.ok).toBe(text.isWellFormed());
        if (done.ok) expect(done.args).toEqual([text]);
        if (done.ok) taken += 1;
        else refused += 1;
      }),
    );
    expect(refused).toBeGreaterThan(0);
    expect(taken).toBeGreaterThan(0);
  });
});

describe.each(WIDTHS)("%s (%i bits, signed %s)", (type, bits, signed) => {
  const [min, max] = bounds(bits, signed);

  it("takes its bounds and zero, one past each refused as out of range", () => {
    expect(accepts(type, String(max))).toBe(true);
    expect(accepts(type, String(min))).toBe(true);
    expect(accepts(type, "0")).toBe(true);
    expect(problemOf(type, String(max + 1n))).toBe("range");
    expect(problemOf(type, String(min - 1n))).toBe("range");
    expect(problemOf(type, String(max * 1000n + 7n))).toBe("range");
  });

  it("takes every value in range, written in canonical decimal, as itself", () => {
    fc.assert(
      fc.property(fc.bigInt({ min, max }), (value) => {
        expect(call(type, String(value))).toEqual({ ok: true, args: [String(value)] });
      }),
    );
  });

  it("refuses every value beyond its bounds", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: max + 1n, max: max * 4n + 9n }), (value) => {
        expect(problemOf(type, String(value))).toBe("range");
      }),
    );
    fc.assert(
      fc.property(fc.bigInt({ min: min * 4n - 9n, max: min - 1n }), (value) => {
        expect(accepts(type, String(value))).toBe(false);
      }),
    );
  });

  it.each([
    "",
    " ",
    "+5",
    "+0",
    "007",
    "00",
    "010",
    "-007",
    "-0",
    "0x10",
    "0o7",
    "0b1",
    "1_000",
    " 5",
    "5 ",
    "5\n",
    "\t5",
    "1e3",
    "1.0",
    "1.",
    ".5",
    "--5",
    "- 5",
    "-",
    "5-",
    "five",
    "NaN",
    "Infinity",
    "５",
    "٥",
    "5\u0000",
  ])("refuses %j, which Go would read another way or refuse", (text) => {
    expect(accepts(type, text)).toBe(false);
  });

  it("names the rule `format` for text that is no canonical integer", () => {
    for (const text of ["+5", "007", "-0", "0x10", "1_000", " 5", "1e3", "1.0", ""]) {
      expect(problemOf(type, text)).toBe("format");
    }
  });

  it("is exactly the canonical decimals within its bounds, whatever the text", () => {
    const near = fc.bigInt({ min: min * 2n - 3n, max: max * 2n + 3n }).map(String);
    fc.assert(
      fc.property(fc.oneof(fc.string(), near, fc.stringMatching(/^[-+]?[0-9]{1,24}$/)), (text) => {
        const canonical = /^-?(0|[1-9][0-9]*)$/.test(text) && text !== "-0";
        const within = canonical && BigInt(text) >= min && BigInt(text) <= max;
        expect(accepts(type, text)).toBe(within);
      }),
    );
  });
});

describe("unsigned integers refuse a sign", () => {
  it.each(["uint", "uint8", "uint16", "uint32", "uint64"])(
    "%s refuses -1 as out of range and -0 as no canonical text",
    (type) => {
      expect(problemOf(type, "-1")).toBe("range");
      expect(problemOf(type, "-0")).toBe("format");
    },
  );
});

describe.each(["float32", "float64"])("%s", (type) => {
  it.each([
    "0",
    "1",
    "-1",
    "1.5",
    "-0.5",
    "0.000001",
    "10.25",
    "123456789.123456789",
    "0.0",
    "0.000",
    "100",
    "-0",
    "-0.0",
  ])("takes the plain decimal %j, unchanged", (text) => {
    expect(call(type, text)).toEqual({ ok: true, args: [text] });
  });

  it.each([
    "",
    "+1",
    "+1.5",
    "1e3",
    "1E3",
    "1e-3",
    "1.5e3",
    "Inf",
    "-Inf",
    "Infinity",
    "NaN",
    ".5",
    "5.",
    "-.5",
    "01",
    "00.5",
    "1,5",
    " 1",
    "1 ",
    "1\n",
    "--1",
    "-",
    "0x1p3",
    "1_0",
    "1.5.5",
    "１",
  ])("refuses %j, which apd or ParseFloat would take or read another way", (text) => {
    expect(problemOf(type, text)).toBe("format");
  });

  it("takes text of 1024 characters and refuses one more, as convert.go's maxFloatArgLen", () => {
    expect(accepts(type, `1.${"0".repeat(1022)}`)).toBe(true);
    expect(problemOf(type, `1.${"0".repeat(1023)}`)).toBe("long");
    expect(problemOf(type, `1.${"0".repeat(5000)}`)).toBe("long");
  });

  it("counts the sign in the 1024 characters", () => {
    expect(accepts(type, `-1.${"0".repeat(1021)}`)).toBe(true);
    expect(problemOf(type, `-1.${"0".repeat(1022)}`)).toBe("long");
  });

  it("refuses a text whose only non-zero digit, whichever it is, underflows to zero", () => {
    for (const digit of "123456789") {
      expect(problemOf(type, `0.${"0".repeat(400)}${digit}`)).toBe("underflow");
      expect(problemOf(type, `-0.${"0".repeat(400)}${digit}`)).toBe("underflow");
    }
  });

  it("takes every finite double of its width written as a plain decimal", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        fc.integer({ min: 0, max: 999_999 }),
        (whole, part) => {
          const text = `${String(whole)}.${String(part).padStart(6, "0")}`;
          expect(accepts(type, text)).toBe(true);
        },
      ),
    );
  });
});

describe("float64's range", () => {
  const max = `17976931348623157${"0".repeat(292)}`;

  it("takes the largest double and refuses one that rounds past it", () => {
    expect(accepts("float64", max)).toBe(true);
    expect(accepts("float64", `-${max}`)).toBe(true);
    expect(problemOf("float64", `18976931348623157${"0".repeat(292)}`)).toBe("range");
    expect(accepts("float64", `17976931348623158${"0".repeat(292)}`)).toBe(true);
    expect(problemOf("float64", `17976931348623159${"0".repeat(292)}`)).toBe("range");
    expect(problemOf("float64", `-17976931348623159${"0".repeat(292)}`)).toBe("range");
    expect(problemOf("float64", `-${"9".repeat(400)}`)).toBe("range");
  });

  it("takes the smallest subnormal and refuses a nonzero text that underflows to zero", () => {
    expect(accepts("float64", `0.${"0".repeat(323)}5`)).toBe(true);
    expect(problemOf("float64", `0.${"0".repeat(400)}1`)).toBe("underflow");
    expect(problemOf("float64", `-0.${"0".repeat(400)}1`)).toBe("underflow");
    expect(accepts("float64", `0.${"0".repeat(400)}`)).toBe(true);
  });
});

describe("float32's range", () => {
  it("takes the largest float32 and refuses one past it", () => {
    expect(accepts("float32", `34028235${"0".repeat(31)}`)).toBe(true);
    expect(accepts("float32", `34${"0".repeat(37)}`)).toBe(true);
    expect(accepts("float32", `-34${"0".repeat(37)}`)).toBe(true);
    expect(accepts("float32", `340282356${"0".repeat(30)}`)).toBe(true);
    expect(accepts("float32", `-340282356${"0".repeat(30)}`)).toBe(true);
    expect(problemOf("float32", `340282357${"0".repeat(30)}`)).toBe("range");
    expect(problemOf("float32", `340282358${"0".repeat(30)}`)).toBe("range");
    expect(problemOf("float32", `4${"0".repeat(38)}`)).toBe("range");
    expect(problemOf("float32", `-4${"0".repeat(38)}`)).toBe("range");
  });

  it("takes a float32 subnormal and refuses a nonzero text that underflows to zero", () => {
    expect(accepts("float32", `0.${"0".repeat(38)}1`)).toBe(true);
    expect(problemOf("float32", `0.${"0".repeat(47)}1`)).toBe("underflow");
    expect(accepts("float32", `0.${"0".repeat(47)}`)).toBe(true);
  });

  it("takes in float64 what float32 refuses as too small or too large", () => {
    expect(accepts("float64", `0.${"0".repeat(47)}1`)).toBe(true);
    expect(accepts("float64", `4${"0".repeat(38)}`)).toBe(true);
  });
});

describe("bytes", () => {
  it.each(["", "AAAA", "AQID", "AA==", "AQ==", "AAA=", "AQI=", "/+8=", "+/+/", "AAECAwQFBgcICQ=="])(
    "takes the canonical base64 %j as a []uint8",
    (text) => {
      expect(call("[]uint8", text)).toEqual({ ok: true, args: [text] });
    },
  );

  it.each(["AR==", "AB==", "AAB=", "AAAAAB=="])(
    "refuses %j: the unused bits of the last byte are not zero (Go takes AR== as AQ==)",
    (text) => {
      expect(problemOf("[]uint8", text)).toBe("format");
    },
  );

  it("takes a last group with no unused bits, whatever its characters", () => {
    expect(accepts("[]uint8", "AAAB")).toBe(true);
  });

  it.each([
    "A",
    "AA",
    "AAA",
    "AAAAA",
    "AAAAAA",
    "AAAAAAA",
    "AA=",
    "A===",
    "====",
    "=AAA",
    "AA=A",
    "AA==AAAA",
    "AAAA====",
    "AAAA\n",
    "AAAA\r\n",
    "AA\nAA",
    "AA AA",
    " AAAA",
    "AAAA ",
    "AA-_",
    "A-_A",
    "AAA!",
    "ＡAAA",
    "AAAA\u0000",
  ])("refuses %j: not padded standard base64 of canonical form", (text) => {
    expect(problemOf("[]uint8", text)).toBe("format");
  });

  it("takes the one spelling of any bytes, as btoa writes it, and refuses the same text with a changed last character", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 1, maxLength: 64 }), (bytes) => {
        const text = b64(bytes);
        expect(call("[]uint8", text)).toEqual({ ok: true, args: [text] });
        expect(accepts("[]uint8", `${text}\n`)).toBe(false);
        expect(accepts("[]uint8", ` ${text}`)).toBe(false);
        expect(accepts("[]uint8", text.replaceAll("+", "-").replaceAll("/", "_"))).toBe(!/[+/]/.test(text));
      }),
    );
  });

  it("takes one spelling of each single byte: 256 bytes, 256 accepted texts of 4 characters", () => {
    let taken = 0;
    for (const x of ALPHABET) for (const y of ALPHABET) if (accepts("[]uint8", `${x}${y}==`)) taken += 1;
    expect(taken).toBe(256);
  });

  it("takes one spelling of each byte pair: of the 64 last characters before `=`, the 16 with two low bits zero", () => {
    for (const prefix of ["AA", "Zm", "+/", "09"]) {
      const taken = Array.from(ALPHABET).filter((z) => accepts("[]uint8", `${prefix}${z}=`));
      expect(taken).toEqual(Array.from(ALPHABET).filter((_, index) => index % 4 === 0));
    }
    expect(problemOf("[]uint8", "AAC=")).toBe("format");
    expect(problemOf("[]uint8", "AAD=")).toBe("format");
    expect(accepts("[]uint8", "AAE=")).toBe(true);
  });

  it("returns for a very large text, whatever it holds", () => {
    expect(accepts("[]uint8", "AAAA".repeat(262_144))).toBe(true);
    expect(problemOf("[]uint8", "!".repeat(1_000_000))).toBe("format");
    expect(problemOf("[]uint8", `${"AAAA".repeat(262_144)}A`)).toBe("format");
    for (const [type] of WIDTHS) expect(problemOf(type, "9".repeat(100_000))).toBe("range");
    expect(problemOf("int", "x".repeat(1_000_000))).toBe("format");
    expect(accepts("string", "é".repeat(1_000_000))).toBe(true);
  });

  it("never parses a long digit text as a number: a canonical int64 or uint64 is 20 characters at most (F5683)", () => {
    const parse = vi.spyOn(globalThis, "BigInt");
    try {
      for (const [type] of WIDTHS) expect(problemOf(type, "9".repeat(21))).toBe("range");
      expect(parse.mock.calls.filter(([text]) => String(text).length > 20)).toEqual([]);
    } finally {
      parse.mockRestore();
    }
  });

  it("is a [N]uint8 of exactly N bytes: the text's length is EncodedLen(N) and it decodes to N", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 1, maxLength: 48 }), (bytes) => {
        const text = b64(bytes);
        expect(call(`[${String(bytes.length)}]uint8`, text)).toEqual({ ok: true, args: [text] });
        expect(problemOf(`[${String(bytes.length + 1)}]uint8`, text)).toBe("length");
        expect(problemOf(`[${String(bytes.length - 1)}]uint8`, text)).toBe("length");
      }),
    );
  });

  it.each([
    ["[0]uint8", ""],
    ["[1]uint8", "AA=="],
    ["[2]uint8", "AAA="],
    ["[3]uint8", "AAAA"],
    ["[32]uint8", `${"A".repeat(43)}=`],
  ])("takes %s as %j", (type, text) => {
    expect(accepts(type, text)).toBe(true);
  });

  it.each([
    ["[3]uint8", ""],
    ["[3]uint8", "AA=="],
    ["[3]uint8", "AAAAAAAA"],
    ["[4]uint8", "AAAA"],
    ["[32]uint8", "A".repeat(44)],
    ["[32]uint8", "A".repeat(40)],
  ])("refuses %s given %j: the wrong number of bytes", (type, text) => {
    expect(accepts(type, text)).toBe(false);
  });

  it("names `length` when the text is canonical base64 of the wrong size, `format` when it is not base64", () => {
    expect(problemOf("[3]uint8", "AA==")).toBe("length");
    expect(problemOf("[3]uint8", "AAAB!")).toBe("format");
    expect(problemOf("[1]uint8", "AR==")).toBe("format");
  });
});

describe("textProblem: what a CallRequest refuses of any text", () => {
  it.each([
    ["a" + String.fromCodePoint(0x202e) + "b"],
    [String.fromCodePoint(0x1b)],
    ["a" + String.fromCharCode(0xd800)],
  ])("calls %j malformed: hidden, or ill-formed", (text) => {
    expect(textProblem(text)).toBe("malformed");
  });

  it.each([
    ["the line separator", "\u2028"],
    ["the paragraph separator", "\u2029"],
    ["the Hangul choseong filler", "\u115f"],
    ["the Hangul jungseong filler", "\u1160"],
    ["the Hangul filler", "\u3164"],
    ["the half-width Hangul filler", "\uffa0"],
  ])("calls a text holding %s malformed, which draws as nothing and a CallRequest refuses", (_, char) => {
    expect(textProblem(`a${char}b`)).toBe("malformed");
    expect(HIDDEN.test(char)).toBe(true);
  });

  it("calls a text of more than 8,192 UTF-8 bytes long, and takes one of exactly 8,192", () => {
    expect(textProblem("a".repeat(8192))).toBeUndefined();
    expect(textProblem("a".repeat(8193))).toBe("long");
    expect(textProblem("é".repeat(4096))).toBeUndefined();
    expect(textProblem("é".repeat(4097))).toBe("long");
  });

  it("takes newline and tab, which a real argument may hold, and every visible character", () => {
    expect(textProblem("a\nb\tc é 日本語 😀")).toBeUndefined();
    expect(HIDDEN.test("\n\t")).toBe(false);
  });
});

describe("the index", () => {
  it("exports callFields, callArgs, realmType and isCarried for the app and jarvis", () => {
    expect(core.callFields).toBe(callFields);
    expect(core.callArgs).toBe(callArgs);
    expect(core.realmType).toBe(realmType);
    expect(core.isCarried).toBe(isCarried);
    expect(core.textProblem).toBe(textProblem);
    expect(core.HIDDEN).toBe(HIDDEN);
  });
});
