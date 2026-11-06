// What a call carries (ADR-0002 §4): from a function's parameters (`vm/qfuncs`) and the text typed in each field, the
// arguments of a `MsgCall`, or per field why not. The rules are gno's `convert.go` (gnolang/gno 07e44776c261, tag v1.5.1,
// what onyx-1 and gnoland-1 run), read as `vm/qfuncs` writes types (keeper.go:1795: each is its base type) and kept
// canonical: stricter than Go where Go is lenient, never looser, so a text reads one way only.

export type Kind = "string" | "bool" | "integer" | "float" | "bytes";
export type Problem = "format" | "range" | "long" | "underflow" | "malformed" | "length";
export interface CallField {
  name: string;
  type: string;
  kind: Kind;
  freeText: boolean;
  length?: number;
}
export interface Param {
  Name: string;
  Type: string;
}
type Params = readonly Param[] | null | undefined;
export type Fields = { ok: true; fields: CallField[] } | { ok: false; why: "read" | "gnoweb" };
export type Args =
  | { ok: true; args: string[] }
  | { ok: false; why: "read" | "gnoweb" }
  | { ok: false; why: "fields"; problems: (Problem | undefined)[] };

type Shape =
  | { kind: "string" | "bool" }
  | { kind: "integer"; bits: number; signed: boolean }
  | { kind: "float"; bits: number }
  | { kind: "bytes"; length?: number };

/** `cur realm` as `vm/qfuncs` writes it: the realm type's base, methods in order (keeper.go:1795, uverse.go:110). */
export function realmType(): string {
  return [
    "interface {.seal func(); Address func() .uverse.address; IsCode func() bool; IsCurrent func() bool;",
    "IsEphemeral func() bool; IsUser func() bool; IsUserCall func() bool; IsUserRun func() bool; PkgPath func() string;",
    "Previous func() .uverse.realm; String func() string; Sub func(string) .uverse.realm; Subpath func() string}",
  ].join(" ");
}

function shapeOf(type: string): Shape | undefined {
  const widths = new Map<string, readonly [number, boolean]>([
    ["int", [64, true]],
    ["int8", [8, true]],
    ["int16", [16, true]],
    ["int32", [32, true]],
    ["int64", [64, true]],
    ["uint", [64, false]],
    ["uint8", [8, false]],
    ["uint16", [16, false]],
    ["uint32", [32, false]],
    ["uint64", [64, false]],
  ]);
  const width = widths.get(type);
  if (width !== undefined) return { kind: "integer", bits: width[0], signed: width[1] };
  if (type === "string" || type === "bool") return { kind: type };
  if (type === "float32" || type === "float64") return { kind: "float", bits: type === "float32" ? 32 : 64 };
  return bytesShape(type);
}

function bytesShape(type: string): Shape | undefined {
  if (type === "[]uint8") return { kind: "bytes" };
  const match = /^\[(0|[1-9][0-9]*)\]uint8$/.exec(type);
  if (match === null) return undefined;
  const length = Number(match[1]);
  return Number.isSafeInteger(length) ? { kind: "bytes", length } : undefined;
}

/** Whether a call carries a parameter of this `vm/qfuncs` type as text. */
export function isCarried(type: string): boolean {
  return shapeOf(type) !== undefined;
}

function integerProblem(text: string, bits: number, signed: boolean): Problem | undefined {
  if (!/^-?(0|[1-9][0-9]*)$/.test(text) || text === "-0") return "format";
  // No canonical 64-bit text is longer ("-9223372036854775808", "18446744073709551615"): a longer one is never parsed.
  if (text.length > 20) return "range";
  const value = BigInt(text);
  const max = signed ? 2n ** BigInt(bits - 1) - 1n : 2n ** BigInt(bits) - 1n;
  const min = signed ? -(2n ** BigInt(bits - 1)) : 0n;
  return value < min || value > max ? "range" : undefined;
}

// Go reads the width through apd then ParseFloat: past the range is an error, too small silently 0 or a subnormal.
function floatProblem(text: string, bits: number): Problem | undefined {
  if (text.length > 1024) return "long";
  if (!/^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(text)) return "format";
  const value = bits === 32 ? Math.fround(Number(text)) : Number(text);
  if (!Number.isFinite(value)) return "range";
  return value === 0 && /[1-9]/.test(text) ? "underflow" : undefined;
}

// Go ignores line breaks and unused trailing bits; here one byte string has one spelling.
function canonicalBase64(text: string): boolean {
  const pad = text.endsWith("==") ? 2 : Number(text.endsWith("="));
  const body = text.slice(0, text.length - pad);
  if (text.length % 4 !== 0 || !/^[A-Za-z0-9+/]*$/.test(body)) return false;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const last = alphabet.indexOf(body.charAt(body.length - 1));
  return pad === 0 || last % (pad === 1 ? 4 : 16) === 0;
}

function bytesProblem(text: string, length: number | undefined): Problem | undefined {
  if (!canonicalBase64(text)) return "format";
  const pad = text.endsWith("==") ? 2 : Number(text.endsWith("="));
  return length !== undefined && (text.length / 4) * 3 - pad !== length ? "length" : undefined;
}

/** The control and format characters but newline and tab (bidi overrides, zero-width, escapes): a card would draw text unlike the
 * signed bytes (D231). */
export const HIDDEN = /(?![\n\t])[\p{Cc}\p{Cf}]/u;
// The UTF-8 bytes of a well-formed text, counted up to `limit` and no further.
function bytesUpTo(text: string, limit: number): number {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
    if (bytes > limit) break;
  }
  return bytes;
}

/** What a CallRequest refuses of any argument, whatever its field: a hidden character, an ill-formed text, or past 8,192 bytes.
 * `callArgs` does not: the request does, and a card asks both (packages/schemas/src/call.ts, D203, D231). */
export function textProblem(text: string): Problem | undefined {
  if (!text.isWellFormed() || HIDDEN.test(text)) return "malformed";
  return bytesUpTo(text, 8192) > 8192 ? "long" : undefined;
}

function problemOf(shape: Shape, text: string): Problem | undefined {
  switch (shape.kind) {
    case "bool":
      return text === "true" || text === "false" ? undefined : "format";
    case "string":
      // The MsgCall is amino JSON in UTF-8: a lone surrogate would be sent as U+FFFD.
      return text.isWellFormed() ? undefined : "malformed";
    case "integer":
      return integerProblem(text, shape.bits, shape.signed);
    case "float":
      return floatProblem(text, shape.bits);
    case "bytes":
      return bytesProblem(text, shape.length);
  }
}

type Resolved = { ok: true; fields: { field: CallField; shape: Shape }[] } | { ok: false; why: "read" | "gnoweb" };

function resolve(params: Params): Resolved {
  if (params?.[0]?.Type !== realmType()) return { ok: false, why: "read" };
  // `...byte` is written `[]uint8` too, and the chain would refuse its call once signed and paid (answer 9c-1).
  if (params.at(-1)?.Type === "[]uint8") return { ok: false, why: "gnoweb" };
  const fields: { field: CallField; shape: Shape }[] = [];
  for (const { Name, Type } of params.slice(1)) {
    const shape = shapeOf(Type);
    if (shape === undefined) return { ok: false, why: "gnoweb" };
    const field: CallField = { name: Name, type: Type, kind: shape.kind, freeText: shape.kind === "string" };
    if (shape.kind === "bytes" && shape.length !== undefined) field.length = shape.length;
    fields.push({ field, shape });
  }
  return { ok: true, fields };
}

/** The fields a call draws, the realm parameter left out: none for a read function, none for a type no call carries. */
export function callFields(params: Params): Fields {
  const done = resolve(params);
  return done.ok ? { ok: true, fields: done.fields.map(({ field }) => field) } : done;
}

/** The `MsgCall` arguments (the texts, unchanged) when each text is good for its field, else why not. Throws a RangeError
 * for another count of texts than fields: a caller's bug. */
export function callArgs(params: Params, texts: readonly string[]): Args {
  const done = resolve(params);
  if (!done.ok) return done;
  if (texts.length !== done.fields.length) throw new RangeError("a text for each field");
  const problems = done.fields.map(({ shape }, index) => problemOf(shape, String(texts[index])));
  return problems.every((problem) => problem === undefined)
    ? { ok: true, args: [...texts] }
    : { ok: false, why: "fields", problems };
}
