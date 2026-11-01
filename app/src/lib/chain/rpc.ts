// The four reads of a chain (slice 5 part 2, 5g-reads), each one `readChain` of read.ts: the block height, a realm's page
// (vm/qrender), a realm's functions (vm/qfuncs) and one call (vm/qeval). One request a call. What the realm wrote is returned
// as text and never interpreted; its error text, Log and Info reach no failure and no value.
import { abciQueryOf } from "@gnoworld/core";
import { QueryAnswer, StatusAnswer } from "@gnoworld/schemas";
import { FunctionList } from "@gnoworld/schemas/functions";
import { evalCall, isExportedName, isRealmPath } from "./evalCall.ts";
import {
  failedRead,
  isHttps,
  readChain,
  type ChainRead,
  type FailureKind,
  type ReadOptions,
  sourceOf,
} from "./read.ts";

type Query = "vm/qrender" | "vm/qeval" | "vm/qfuncs";

// The text of a base64 body, or null when it is no base64 or no UTF-8.
function textOf(base64: string): string | null {
  try {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function kindOf(type: string): FailureKind {
  if (type === "/vm.InvalidPkgPathError") return "no-realm";
  if (type === "/vm.NoRenderDeclError") return "no-page";
  return "chain-refused";
}

const withoutSlash = (rpc: string): string => (rpc.endsWith("/") ? rpc.slice(0, -1) : rpc);

// What an answer's body gives: its text, or the kind of failure it is.
function bodyText(answer: QueryAnswer): { text: string } | { kind: FailureKind } {
  const body = answer.result?.response.ResponseBase;
  if (answer.error !== undefined) return { kind: "chain-refused" };
  if (body === undefined) return { kind: "wrong-shape" };
  if (body.Error !== undefined && body.Error !== null) return { kind: kindOf(body.Error["@type"]) };
  const text = typeof body.Data === "string" ? textOf(body.Data) : null;
  return text === null ? { kind: "wrong-shape" } : { text };
}

interface Ask<T> {
  path: Query;
  data: string;
  /** The text of the answer as a value, or null for a text of the wrong shape. */
  decode: (text: string) => T | null;
}

// An abci_query: the data in hex, the answer's text through `decode`.
async function query<T>(rpc: string, { path, data, decode }: Ask<T>, options: ReadOptions): Promise<ChainRead<T>> {
  const url = `${withoutSlash(rpc)}${abciQueryOf(path, new TextEncoder().encode(data))}`;
  const answer = await readChain(url, QueryAnswer, options);
  if (!answer.ok) return failedRead(answer.failure.kind, answer.source, answer.failure.status);
  const body = bodyText(answer.value);
  const value = "text" in body ? decode(body.text) : null;
  if (value !== null) return { ok: true, value, source: answer.source };
  return failedRead("kind" in body ? body.kind : "wrong-shape", answer.source);
}

// The address of a read, or a refusal without a request when the RPC is no https address.
function guarded<T>(rpc: string, options: ReadOptions, run: () => Promise<ChainRead<T>>): Promise<ChainRead<T>> {
  return isHttps(rpc) ? run() : Promise.resolve(failedRead("refused", sourceOf(rpc, options)));
}

const badName = <T>(rpc: string, options: ReadOptions): Promise<ChainRead<T>> =>
  Promise.resolve(failedRead("bad-name", sourceOf(rpc, options)));

/** The latest block's height and its own time (a page's age). `vm` sets no Height of its own, so a page's height is this read. */
export function readHeight(
  rpc: string,
  options: ReadOptions = {},
): Promise<ChainRead<{ height: number; time: string }>> {
  return guarded(rpc, options, async () => {
    const status = await readChain(`${withoutSlash(rpc)}/status`, StatusAnswer, options);
    if (!status.ok) return status;
    const { latest_block_height: text, latest_block_time: time } = status.value.result.sync_info;
    const height = Number(text);
    return Number.isSafeInteger(height)
      ? { ok: true, value: { height, time }, source: status.source }
      : failedRead("wrong-shape", status.source);
  });
}

/** A realm's page, `<realm>:<path>`, as the chain wrote it. */
export function readPage(
  rpc: string,
  { realm, path = "" }: { realm: string; path?: string },
  options: ReadOptions = {},
): Promise<ChainRead<string>> {
  if (!isRealmPath(realm)) return badName(rpc, options);
  return guarded(rpc, options, () =>
    query(rpc, { path: "vm/qrender", data: `${realm}:${path}`, decode: (text) => text }, options),
  );
}

/** The typed text of one call of one exported name, one line a result. Nothing is asked when the builder gives no call. */
export function readEval(
  rpc: string,
  { realm, name }: { realm: string; name: string },
  options: ReadOptions = {},
): Promise<ChainRead<string>> {
  const call = evalCall(realm, name);
  if (call === null) return badName(rpc, options);
  return guarded(rpc, options, () => query(rpc, { path: "vm/qeval", data: call, decode: (text) => text }, options));
}

function functionsOf(text: string): { name: string; readable: boolean }[] | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const list = FunctionList.safeParse(json);
  if (!list.success) return null;
  return (list.data ?? [])
    .filter(({ FuncName }) => isExportedName(FuncName))
    .map(({ FuncName, Params, Results }) => ({
      name: FuncName,
      readable: (Params ?? []).length === 0 && (Results ?? []).length > 0,
    }));
}

/** The exported functions of a realm, in the chain's order: readable when it takes nothing (a `cur` is a parameter) and gives something. */
export function readFunctions(
  rpc: string,
  realm: string,
  options: ReadOptions = {},
): Promise<ChainRead<{ name: string; readable: boolean }[]>> {
  if (!isRealmPath(realm)) return badName(rpc, options);
  return guarded(rpc, options, () => query(rpc, { path: "vm/qfuncs", data: realm, decode: functionsOf }, options));
}
