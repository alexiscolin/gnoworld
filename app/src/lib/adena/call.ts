// One call to a realm through Adena (slice 9's plan, 9b): the request the card drew, the account and the network
// read again right before signing, one MsgCall, and the answer read as outside data. Every end is a result with
// its reason, and nothing is asked of Adena for the request until those asked before it have answered (queue.ts).
import { Address, CallRequest } from "@gnoworld/schemas";
import { z } from "../jitless.ts";
import { detect, method } from "./detect.ts";
import { ask, capped, read, refusal, type Answered, type CallFailure, type Failed } from "./answers.ts";
import { serially } from "./queue.ts";

export type CallResult =
  { ok: true; hash: string; height: string; log: string } | { ok: false; reason: CallFailure; log?: string };
/** The chain a call is for, as app/data/universes.json names it: what AddNetwork needs. */
export interface Universe {
  chainId: string;
  name: string;
  rpc: string;
}

// The SDK's default gas and fee (bin/index.js:2452; gno-js-client's default fee, in ugnot): the card shows the fee as an estimate.
const GAS_WANTED = 10_000_000;
const GAS_FEE = 1_000_000;
const SITE = "gnoworld";
const Account = z.object({ address: Address, chainId: z.string().check(z.minLength(1)) });
const Network = z.object({ chainId: z.string().check(z.minLength(1)) });
// A transaction's hash is 32 bytes in base64; a block's height a whole number from 1.
const Hash = z.string().check(z.regex(/^[A-Za-z0-9+/]{43}=$/));
const Height = z.string().check(z.regex(/^[1-9][0-9]{0,15}$/));
// Error and Log sit under ResponseBase (tm2-js-client 3.3.0 common.d.mts:146-150; the Adena SDK 0.1.1 bin/index.d.ts:207-220).
const Part = z.object({ ResponseBase: z.object({ Error: z.unknown(), Log: z.string() }) });
const Sent = z.object({ check_tx: Part, deliver_tx: Part, hash: Hash, height: Height });

type Need = (name: string, ...args: unknown[]) => Promise<Answered>;
interface Wallet {
  establish: (...args: unknown[]) => unknown;
  getAccount: (...args: unknown[]) => unknown;
  getNetwork: (...args: unknown[]) => unknown;
  doContract: (...args: unknown[]) => unknown;
  need: Need;
}
const SUCCESS: Record<string, readonly string[]> = {
  SwitchNetwork: ["SWITCH_NETWORK_SUCCESS"],
  AddNetwork: ["ADD_NETWORK_SUCCESS"],
};

// The extension and the methods every call needs; the ones only some steps need are asked for by `need`.
function open(adena: unknown): Wallet | Failed {
  const found = detect(adena);
  if (!found.ok) return refusal(found.reason);
  const establish = method(adena, "AddEstablish");
  const getAccount = method(adena, "GetAccount");
  const getNetwork = method(adena, "GetNetwork");
  const doContract = method(adena, "DoContract");
  if (establish === undefined) return refusal("missing");
  if (getAccount === undefined || getNetwork === undefined || doContract === undefined) return refusal("outdated");
  // An extension without a method only some steps need is too old when that step comes.
  const need: Need = (name, ...args) => {
    const run = method(adena, name);
    return run === undefined ? Promise.resolve(refusal("outdated")) : ask(() => run(...args), SUCCESS[name] ?? []);
  };
  return { establish, getAccount, getNetwork, doContract, need };
}

// Adena's account must be the call's caller: the person chose that account in gnoworld.
async function checkAccount(wallet: Wallet, caller: string): Promise<Failed | undefined> {
  const account = () => read(() => wallet.getAccount(), ["GET_ACCOUNT"], Account);
  let who = await account();
  if (!who.ok && who.reason === "not-connected") {
    // A refused connection comes back with no error at all: the state is read again, never assumed.
    const letIn = await ask(() => wallet.establish(SITE), ["CONNECTION_SUCCESS", "ALREADY_CONNECTED"]);
    if (!letIn.ok) return letIn;
    who = await account();
  }
  if (!who.ok) return who;
  return who.value.address === caller ? undefined : refusal("wrong-account");
}

// The network is read right before signing and must be the universe's, switched or added if not; still wrong, stop.
async function checkNetwork(wallet: Wallet, universe: Universe): Promise<Failed | undefined> {
  const network = () => read(() => wallet.getNetwork(), ["GET_NETWORK", "GET_NETWORK_SUCCESS"], Network);
  const on = await network();
  if (!on.ok) return on;
  if (on.value.chainId === universe.chainId) return undefined;
  const stopped = await switchTo(wallet.need, universe);
  if (stopped !== undefined) return stopped;
  const again = await network();
  if (!again.ok) return again;
  return again.value.chainId === universe.chainId ? undefined : refusal("wrong-network");
}

async function work(adena: unknown, request: CallRequest, universe: Universe): Promise<CallResult | Failed> {
  const wallet = open(adena);
  if ("ok" in wallet) return wallet;
  const stopped = (await checkAccount(wallet, request.caller)) ?? (await checkNetwork(wallet, universe));
  return stopped ?? send(wallet.doContract, request, universe);
}

// Moves Adena to the universe's chain: switch, or add it then switch. A failure ends it; undefined, the chain is read again.
async function switchTo(need: Need, { chainId, name, rpc }: Universe): Promise<Failed | undefined> {
  const switched = await need("SwitchNetwork", chainId);
  if (switched.ok || switched.type === "REDUNDANT_CHANGE_REQUEST") return undefined;
  if (switched.type !== "UNADDED_NETWORK") return switched;
  const added = await need("AddNetwork", { chainId, chainName: name, rpcUrl: rpc });
  if (!added.ok) return added;
  const again = await need("SwitchNetwork", chainId);
  if (again.ok || again.type === "REDUNDANT_CHANGE_REQUEST") return undefined;
  return again.type === "UNADDED_NETWORK" ? refusal("wrong-network") : again;
}

/** What DoContract is given: the request's one MsgCall, no coins, no memo; pinned to the universe's chain and node. */
export const transaction = (request: CallRequest, { chainId, rpc }: Universe) => ({
  messages: [
    {
      type: "/vm.m_call",
      value: {
        caller: request.caller,
        send: "",
        max_deposit: "",
        pkg_path: request.realm,
        func: request.func,
        args: [...request.args],
      },
    },
  ],
  gasFee: GAS_FEE,
  gasWanted: GAS_WANTED,
  networkInfo: { chainId, rpcUrl: rpc },
});

async function send(
  doContract: (...args: unknown[]) => unknown,
  request: CallRequest,
  universe: Universe,
): Promise<CallResult | Failed> {
  const done = await read(
    () => doContract(transaction(request, universe)),
    ["TRANSACTION_SENT", "TRANSACTION_SUCCESS"],
    Sent,
  );
  if (!done.ok) return done;
  const { check_tx, deliver_tx, hash, height } = done.value;
  // The node refused it at check, or the realm failed it: no hash is a success then.
  const failed = [check_tx, deliver_tx].find(
    ({ ResponseBase }) => ResponseBase.Error !== null && ResponseBase.Error !== undefined,
  );
  if (failed !== undefined) return refusal("failed", "", failed.ResponseBase.Log);
  return { ok: true, hash, height, log: capped(deliver_tx.ResponseBase.Log) };
}

/** Asks Adena, once the requests before it are done, to sign and send this call, as the account on the universe's chain. */
export function callContract(adena: unknown, request: CallRequest, universe: Universe): Promise<CallResult> {
  // A typed request is not a checked one: the caps and the shapes the card shows are read again where Adena is asked.
  const parsed = CallRequest.safeParse(request);
  if (!parsed.success) return Promise.resolve({ ok: false, reason: "malformed" });
  if (parsed.data.chainId !== universe.chainId) return Promise.resolve({ ok: false, reason: "wrong-network" });
  return serially(async () => {
    try {
      const result = await work(adena, parsed.data, universe);
      if (result.ok) return result;
      return result.log === undefined
        ? { ok: false, reason: result.reason }
        : { ok: false, reason: result.reason, log: result.log };
    } catch {
      return { ok: false, reason: "failed" };
    }
  });
}
