// The app's three reads of a realm (slice 5 part 2, 5g-reads) around the chain package's (D112, D114): a realm's page
// (vm/qrender), its functions (vm/qfuncs) and one call (vm/qeval), each asked only for a name evalCall.ts's checks pass, the
// tier-1 builder of every expression sent (readUser's two included, D283). One request a call. What the realm wrote is returned
// as text and never interpreted.
// The app names no universe's chain to its reads yet (D118): each states null.
import { readEvaluated, readFunctionList, readRender } from "@gnoworld/chain/node";
import { queryOptions } from "@tanstack/react-query";
import { keys } from "../query/keys.ts";
import { Unread } from "../query/client.ts";
import { pageFetch } from "../query/policy.ts";
import { failedRead, sourceOf, type ChainRead, type ReadOptions } from "@gnoworld/chain/read";
import { evalCall, isExportedName, isRealmPath, userCall } from "./evalCall.ts";

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

/** The typed text of one of the two calls on r/sys/users's record of `account` (D92, D283: evalCall.ts builds the expression).
 * `IsDeleted` answers for a missing record, which `Name` would panic on. Nothing is asked for what is no address. */
export function readUser(
  rpc: string,
  { account, call }: { account: string; call: "IsDeleted" | "Name" },
  options: ReadOptions = {},
): Promise<ChainRead<string>> {
  const expression = userCall(account, call);
  if (expression === null) return badName(rpc, options);
  return readEvaluated(rpc, expression, { ...options, chainId: null });
}

type Listing = (Awaited<ReturnType<typeof readFunctionList>> & { ok: true })["value"][number];

// A realm's exported functions, in the chain's order.
async function listExported(rpc: string, realm: string, options: ReadOptions): Promise<ChainRead<Listing[]>> {
  if (!isRealmPath(realm)) return badName(rpc, options);
  const read = await readFunctionList(rpc, realm, { ...options, chainId: null });
  if (!read.ok) return read;
  return { ok: true, value: read.value.filter(({ FuncName }) => isExportedName(FuncName)), source: read.source };
}

export type Readable = { name: string; readable: boolean }[];
export type Callables = { name: string; params: { Name: string; Type: string }[] }[];

export const toFunctions = (read: ChainRead<Listing[]>): ChainRead<Readable> =>
  read.ok
    ? {
        ok: true,
        value: read.value.map(({ FuncName, Params, Results }) => ({
          name: FuncName,
          readable: (Params ?? []).length === 0 && (Results ?? []).length > 0,
        })),
        source: read.source,
      }
    : read;

export const toCallable = (read: ChainRead<Listing[]>): ChainRead<Callables> =>
  read.ok
    ? {
        ok: true,
        value: read.value.map(({ FuncName, Params }) => ({ name: FuncName, params: Params ?? [] })),
        source: read.source,
      }
    : read;

/** The exported functions of a realm, in the chain's order: readable when it takes nothing (a `cur` is a parameter) and gives something. */
export async function readFunctions(rpc: string, realm: string, options?: ReadOptions): Promise<ChainRead<Readable>> {
  return toFunctions(await listExported(rpc, realm, options ?? {}));
}

/** The exported functions of a realm with their parameters, in the chain's order: what a call card is made from. */
export async function readCallable(rpc: string, realm: string, options?: ReadOptions): Promise<ChainRead<Callables>> {
  return toCallable(await listExported(rpc, realm, options ?? {}));
}

/** A realm's exported functions as a query: the one read the function lists and the call forms of a view share, kept and asked ahead
 * (warm.ts). A list that did not come whole is no answer: it throws, with the failed read for the view to say. */
export const realmFunctions = (rpc: string, realm: string, options?: ReadOptions) =>
  queryOptions({
    queryKey: keys.functions(rpc, realm),
    queryFn: async ({ signal }) => {
      const read = await listExported(rpc, realm, { fetch: pageFetch, ...options, signal });
      if (!read.ok) throw new Unread(read, read.failure);
      return read;
    },
  });
