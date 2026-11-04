// The app's three reads of a realm (slice 5 part 2, 5g-reads) around the chain package's (D112, D114): a realm's page
// (vm/qrender), its functions (vm/qfuncs) and one call (vm/qeval), each asked only for a name evalCall.ts's checks pass, the
// tier-1 builder of the one expression sent. One request a call. What the realm wrote is returned as text and never interpreted.
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
  return readRender(rpc, `${realm}:${path}`, options);
}

/** The typed text of one call of one exported name, one line a result. Nothing is asked when the builder gives no call. */
export function readEval(
  rpc: string,
  { realm, name }: { realm: string; name: string },
  options: ReadOptions = {},
): Promise<ChainRead<string>> {
  const call = evalCall(realm, name);
  if (call === null) return badName(rpc, options);
  return readEvaluated(rpc, call, options);
}

/** The exported functions of a realm, in the chain's order: readable when it takes nothing (a `cur` is a parameter) and gives something. */
export async function readFunctions(
  rpc: string,
  realm: string,
  options: ReadOptions = {},
): Promise<ChainRead<{ name: string; readable: boolean }[]>> {
  if (!isRealmPath(realm)) return badName(rpc, options);
  const read = await readFunctionList(rpc, realm, options);
  if (!read.ok) return read;
  const value = read.value
    .filter(({ FuncName }) => isExportedName(FuncName))
    .map(({ FuncName, Params, Results }) => ({
      name: FuncName,
      readable: (Params ?? []).length === 0 && (Results ?? []).length > 0,
    }));
  return { ok: true, value, source: read.source };
}
