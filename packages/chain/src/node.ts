// The reads of a chain's node (D112), each one `readChain` of read.ts: the latest block's height, and the three `abci_query`
// paths gnoworld asks, a realm's page (vm/qrender), one expression (vm/qeval) and a realm's functions (vm/qfuncs). One
// request a read, after its node's status when a chain is named, the two under one time limit. What the realm wrote is returned as text and never interpreted; its error text, Log and Info reach no failure
// and no value. The expression of a vm/qeval is its caller's to build, with its tier-1 checks (app/src/lib/chain/evalCall.ts).
import { jsonOf } from "@gnoworld/core";
import { QueryAnswer, StatusAnswer } from "@gnoworld/schemas";
import { FunctionList } from "@gnoworld/schemas/functions";
import {
  failedRead,
  isHttps,
  readChain,
  sourceOf,
  type ChainRead,
  type FailureKind,
  type ReadOptions,
} from "./read.ts";
import { withinTime } from "./transport.ts";

type Query = "vm/qrender" | "vm/qeval" | "vm/qfuncs";

const hexOf = (text: string): string =>
  Array.from(new TextEncoder().encode(text), (byte) => byte.toString(16).padStart(2, "0")).join("");

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
  const url = `${withoutSlash(rpc)}/abci_query?path=%22${path.replace("/", "%2F")}%22&data=0x${hexOf(data)}`;
  const answer = await readChain(url, QueryAnswer, options);
  if (!answer.ok) return failedRead(answer.failure.kind, answer.source, answer.failure.status);
  const body = bodyText(answer.value);
  const value = "text" in body ? decode(body.text) : null;
  if (value !== null) return { ok: true, value, source: answer.source };
  return failedRead("kind" in body ? body.kind : "wrong-shape", answer.source);
}

const refused = <T>(rpc: string, options: ReadOptions): Promise<ChainRead<T>> =>
  Promise.resolve(failedRead("refused", sourceOf(rpc, options)));

// The node's status; with a chain named, a node that names another, or none, is read no further (D118). An empty name is
// no chain's: a node that names none matches it nowhere.
async function statusOf(rpc: string, options: ReadOptions): Promise<ChainRead<StatusAnswer>> {
  const status = await readChain(`${withoutSlash(rpc)}/status`, StatusAnswer, options);
  const { chainId } = options;
  if (!status.ok || chainId === undefined) return status;
  const network = status.value.result.node_info?.network;
  return chainId !== "" && network === chainId ? status : failedRead("other-chain", status.source);
}

// A read of an https RPC, or a refusal without a request; with a chain named, its node's status first, the two requests
// under the read's one time limit and its caller's signal (10h's review, V1).
function guarded<T>(
  rpc: string,
  options: ReadOptions,
  run: (options: ReadOptions) => Promise<ChainRead<T>>,
): Promise<ChainRead<T>> {
  if (!isHttps(rpc)) return refused(rpc, options);
  if (options.chainId === undefined) return run(options);
  const source = sourceOf(rpc, options);
  const ends = { timeout: failedRead<T>("timeout", source), left: failedRead<T>("down", source) };
  return withinTime(options, ends, async (signal) => {
    const status = await statusOf(rpc, { ...options, signal });
    return status.ok ? run({ ...options, signal }) : status;
  });
}

/** The latest block's height and its own time (a page's age), its node checked on the same status when a chain is named.
 * `vm` sets no Height of its own, so a page's height is this read. */
export async function readHeight(
  rpc: string,
  options: ReadOptions = {},
): Promise<ChainRead<{ height: number; time: string }>> {
  if (!isHttps(rpc)) return refused(rpc, options);
  const status = await statusOf(rpc, options);
  if (!status.ok) return status;
  const { latest_block_height: text, latest_block_time: time } = status.value.result.sync_info;
  const height = Number(text);
  return Number.isSafeInteger(height)
    ? { ok: true, value: { height, time }, source: status.source }
    : failedRead("wrong-shape", status.source);
}

/** A realm's page as the chain wrote it, for the data `<realm>:<path>` its caller checked. */
export function readRender(rpc: string, data: string, options: ReadOptions = {}): Promise<ChainRead<string>> {
  return guarded(rpc, options, (read) => query(rpc, { path: "vm/qrender", data, decode: (text) => text }, read));
}

/** The typed text of one expression, which its caller built with its own checks: the chain runs any expression it is sent. */
export function readEvaluated(rpc: string, expression: string, options: ReadOptions = {}): Promise<ChainRead<string>> {
  return guarded(rpc, options, (read) =>
    query(rpc, { path: "vm/qeval", data: expression, decode: (text) => text }, read),
  );
}

type Functions = NonNullable<FunctionList>;

// A realm's functions as qfuncs lists them, none for a realm with none; null for a text that is no such list.
function functionListOf(text: string): Functions | null {
  const list = FunctionList.safeParse(jsonOf(text));
  return list.success ? (list.data ?? []) : null;
}

/** A realm's functions, every one in the chain's order, as `vm/qfuncs` lists them. */
export function readFunctionList(rpc: string, realm: string, options: ReadOptions = {}): Promise<ChainRead<Functions>> {
  return guarded(rpc, options, (read) => query(rpc, { path: "vm/qfuncs", data: realm, decode: functionListOf }, read));
}
