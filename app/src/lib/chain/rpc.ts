// The app's three reads of a realm (slice 5 part 2, 5g-reads) around the chain package's (D112, D114): a realm's page
// (vm/qrender), its functions (vm/qfuncs) and one call (vm/qeval), each asked only for a name evalCall.ts's checks pass, the
// tier-1 builder of the one expression sent. One request a call. What the realm wrote is returned as text and never interpreted.
// The app names no universe's chain to its reads yet (D118): each states null.
import { readEvaluated, readFunctionList, readRender } from "@gnoworld/chain/node";
import { failedRead, sourceOf, type ChainRead, type ReadOptions } from "@gnoworld/chain/read";
import { evalCall, isExportedName, isRealmPath } from "./evalCall.ts";

const badName = <T>(rpc: string, options: ReadOptions): Promise<ChainRead<T>> =>
  Promise.resolve(failedRead("bad-name", sourceOf(rpc, options)));

/** A realm's page, `<realm>:<path>`, as the chain wrote it. */
export function readPage(
  rpc: string,
  { realm, path = "" }: { realm: string; path?: string },
  options: ReadOptions = {},
): Promise<ChainRead<string>> {
  if (!isRealmPath(realm)) return badName(rpc, options);
  return readRender(rpc, `${realm}:${path}`, { ...options, chainId: null });
}

/** The typed text of one call of one exported name, one line a result. Nothing is asked when the builder gives no call. */
export function readEval(
  rpc: string,
  { realm, name }: { realm: string; name: string },
  options: ReadOptions = {},
): Promise<ChainRead<string>> {
  const call = evalCall(realm, name);
  if (call === null) return badName(rpc, options);
  return readEvaluated(rpc, call, { ...options, chainId: null });
}

type Listing = (Awaited<ReturnType<typeof readFunctionList>> & { ok: true })["value"][number];

// A realm's exported functions, in the chain's order.
async function listExported(rpc: string, realm: string, options: ReadOptions): Promise<ChainRead<Listing[]>> {
  if (!isRealmPath(realm)) return badName(rpc, options);
  const read = await readFunctionList(rpc, realm, { ...options, chainId: null });
  if (!read.ok) return read;
  return { ok: true, value: read.value.filter(({ FuncName }) => isExportedName(FuncName)), source: read.source };
}

// The reads under way, by the options they were asked with and the list: two panels of one view that ask for the same list in the
// same moment share one request. A read that has ended is forgotten, so a new mount reads again.
const flights = new WeakMap<object, Map<string, Promise<ChainRead<Listing[]>>>>();
const NO_OPTIONS = {};

function readExported(rpc: string, realm: string, options: ReadOptions | undefined): Promise<ChainRead<Listing[]>> {
  const held = flights.get(options ?? NO_OPTIONS) ?? new Map<string, Promise<ChainRead<Listing[]>>>();
  flights.set(options ?? NO_OPTIONS, held);
  const key = `${rpc} ${realm}`;
  const flying = held.get(key);
  if (flying !== undefined) return flying;
  const reading = listExported(rpc, realm, options ?? {}).finally(() => {
    held.delete(key);
  });
  held.set(key, reading);
  return reading;
}

/** The exported functions of a realm, in the chain's order: readable when it takes nothing (a `cur` is a parameter) and gives something. */
export async function readFunctions(
  rpc: string,
  realm: string,
  options?: ReadOptions,
): Promise<ChainRead<{ name: string; readable: boolean }[]>> {
  const read = await readExported(rpc, realm, options);
  if (!read.ok) return read;
  const value = read.value.map(({ FuncName, Params, Results }) => ({
    name: FuncName,
    readable: (Params ?? []).length === 0 && (Results ?? []).length > 0,
  }));
  return { ok: true, value, source: read.source };
}

/** The exported functions of a realm with their parameters, in the chain's order: what a call card is made from. */
export async function readCallable(
  rpc: string,
  realm: string,
  options?: ReadOptions,
): Promise<ChainRead<{ name: string; params: { Name: string; Type: string }[] }[]>> {
  const read = await readExported(rpc, realm, options);
  if (!read.ok) return read;
  return {
    ok: true,
    value: read.value.map(({ FuncName, Params }) => ({ name: FuncName, params: Params ?? [] })),
    source: read.source,
  };
}
