// The adena module as a link's tests drive it (fakeAdena.ts is the extension's own API): `vi.mock` the module with `signingAdena`,
// and set `wallet` from the test, read at each call: the account Adena is on, what it signs once `wait` resolves.
import { Address } from "@gnoworld/schemas";
import type { Login, SignResult } from "../src/lib/adena/adena.ts";

/** The wallet's state, one per test file: a test changes it between two presses. */
export const wallet: { on: string; asked: Login[]; wait: Promise<void>; answer: (login: Login) => SignResult } = {
  on: "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5",
  asked: [],
  wait: Promise.resolve(),
  answer: () => ({ ok: false, reason: "failed" }),
};

/** The module's functions a link calls, over `wallet`. */
export const signingAdena = {
  pageAdena: () => ({}),
  connect: () => Promise.resolve({ ok: true as const, address: Address.parse(wallet.on), chainId: "onyx-1" }),
  signLogin: async (_: unknown, login: Login): Promise<SignResult> => {
    wallet.asked.push(login);
    await wallet.wait;
    return wallet.answer(login);
  },
};
