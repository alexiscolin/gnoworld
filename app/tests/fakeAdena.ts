// A stand-in for Adena, its answers written by hand with invented values in the shapes Adena's extension gives: the
// account, the network, a switch to the chain it is already on, a signed call, a refused one. No wallet's answer is
// ever kept in this repository; only the shapes are Adena's.

type Answer = Record<string, unknown>;
const failure = (type: string, code: number): Answer => ({ status: "failure", type, code, message: "", data: {} });

/** An invented account: the bech32 of the 20 bytes "gnoworld-test-wallet". */
export const FAKE_ACCOUNT = "g1vahx7am0wfkxgtt5v4ehgtthv9kxcet59faz3k";
/** The invented hash of the signed call. */
export const SIGNED_HASH = "0123456789abcdef".repeat(4);

/** Each answer by what it answers; the address and the chain are the caller's to set. */
export const ANSWERS = {
  account: {
    status: "success",
    type: "GET_ACCOUNT",
    code: 0,
    message: "",
    data: {
      address: FAKE_ACCOUNT,
      coins: "1000000ugnot",
      chainId: "onyx-1",
      status: "ACTIVE",
      accountNumber: "7",
      sequence: "3",
    },
  },
  network: {
    status: "success",
    type: "GET_NETWORK",
    code: 0,
    message: "",
    data: {
      chainId: "onyx-1",
      networkName: "Onyx",
      addressPrefix: "g",
      rpcUrl: "https://rpc.onyx.testnets.gno.land:443",
    },
  },
  // Adena answers a switch to the chain it is on with a failure, not a success.
  sameChain: {
    status: "failure",
    type: "REDUNDANT_CHANGE_REQUEST",
    code: 4001,
    message: "Unable to change to the current network.",
    data: { chainId: "onyx-1" },
  },
  // A signed call: a hex hash and the realm's Log, no height, whatever the SDK's types say.
  signed: {
    status: "success",
    type: "TRANSACTION_SUCCESS",
    code: 0,
    message: "",
    data: { error: null, data: null, Log: "", hash: SIGNED_HASH },
  },
  refused: {
    status: "failure",
    type: "TRANSACTION_REJECTED",
    code: 4000,
    message: "The transaction has been rejected by the user.",
    data: {},
  },
} as const satisfies Record<string, Answer>;

interface FakeAdena {
  /** Every method asked, in order, with its first argument. */
  asked: { call: string; arg?: unknown }[];
  adena: Record<string, (...args: unknown[]) => unknown>;
}

interface Options {
  account: string;
  /** The chain Adena is on; a switch to a known chain moves it. */
  chain?: string;
  known?: readonly string[];
  /** What DoContract answers: the signed call unless said. */
  doContract?: (transaction: unknown) => unknown;
  /** A switch that answers success and moves nothing. */
  stuck?: boolean;
}

export function fakeAdena({
  account,
  chain = "onyx-1",
  known = ["onyx-1", "gnoland-1"],
  doContract,
  stuck = false,
}: Options): FakeAdena {
  const asked: FakeAdena["asked"] = [];
  let on = chain;
  const note = (call: string, arg?: unknown) => asked.push(arg === undefined ? { call } : { call, arg });
  const adena: FakeAdena["adena"] = {
    AddEstablish: () => {
      note("AddEstablish");
      return Promise.resolve({ status: "success", type: "CONNECTION_SUCCESS", code: 0, message: "", data: {} });
    },
    GetAccount: () => {
      note("GetAccount");
      return Promise.resolve({ ...ANSWERS.account, data: { ...ANSWERS.account.data, address: account, chainId: on } });
    },
    GetNetwork: () => {
      note("GetNetwork");
      return Promise.resolve({ ...ANSWERS.network, data: { ...ANSWERS.network.data, chainId: on } });
    },
    SwitchNetwork: (id) => {
      note("SwitchNetwork", id);
      if (id === on) return Promise.resolve({ ...ANSWERS.sameChain, data: { chainId: on } });
      if (!known.includes(String(id))) return Promise.resolve(failure("UNADDED_NETWORK", 4001));
      if (!stuck) on = String(id);
      return Promise.resolve({ status: "success", type: "SWITCH_NETWORK_SUCCESS", code: 0, message: "", data: {} });
    },
    DoContract: (transaction) => {
      note("DoContract", transaction);
      return doContract === undefined ? Promise.resolve(ANSWERS.signed) : doContract(transaction);
    },
  };
  return { asked, adena };
}
