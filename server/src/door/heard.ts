// The accounts the server has heard speak in the chat (D13985): a line moderation let through, in any room, kept in memory
// alone and held to a size, the account heard longest ago forgotten first. A restart empties it: an account asks again
// only once it has spoken.
import { remember } from "../remember.ts";

export interface Heard {
  said: (account: string) => void;
  has: (account: string) => boolean;
}

export function makeHeard(max: number): Heard {
  const accounts = new Map<string, true>();
  return {
    said: (account) => {
      remember(accounts, [account, true], max);
    },
    has: (account) => accounts.has(account),
  };
}
