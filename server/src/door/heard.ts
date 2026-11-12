// The accounts the server has heard speak in the chat (D13985): a line moderation let through, in any room, kept in memory
// alone and held to a size, the account heard longest ago forgotten first. A restart empties it: an account asks again
// only once it has spoken.
import { remember } from "../remember.ts";

export interface Heard {
  said: (account: string) => void;
  has: (account: string) => boolean;
  /** Whether the account is heard within `ms`: at once if it is, as it speaks, false once the time is out. */
  soon: (account: string, ms: number) => Promise<boolean>;
}

export function makeHeard(max: number): Heard {
  const accounts = new Map<string, true>();
  // Who waits for an account's line: an ask that came with it, each gone as it is told or its time is out.
  const waiting = new Map<string, Set<(heard: boolean) => void>>();
  const has = (account: string) => accounts.get(account) === true;
  return {
    said: (account) => {
      remember(accounts, [account, true], max);
      for (const tell of waiting.get(account) ?? []) tell(true);
    },
    has,
    soon: (account, ms) =>
      has(account)
        ? Promise.resolve(true)
        : new Promise((resolve) => {
            const waiters = waiting.get(account) ?? new Set();
            waiting.set(account, waiters);
            const tell = (heard: boolean) => {
              clearTimeout(timer);
              waiters.delete(tell);
              if (waiters.size === 0) waiting.delete(account);
              resolve(heard);
            };
            const timer = setTimeout(() => {
              tell(false);
            }, ms);
            waiters.add(tell);
          }),
  };
}
