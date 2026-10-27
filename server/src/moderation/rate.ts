// A second rate rule, beside check.ts's 20 messages a minute (decisions f0c19ce, F1123): 100 lines a minute an account,
// a message of several lines counting each of its lines. Counted in memory, so a restart forgets it and the database
// keeps its shape.
const LIMIT = 100;
const MS = 60_000;

/** A message: its id, Ergo's time for it and its lines. */
interface Seen {
  id: string;
  at: number;
  lines: number;
}

export interface LineRate {
  /** Counts a message, once for its id; whether the account is past the limit in the minute before it. */
  add: (account: string, message: Seen) => boolean;
  /** The messages held, all accounts: bounded by the accounts seen in the last minute, 101 messages each. */
  held: () => number;
}

/** The lines each account sent, `now` being the clock the accounts' last sight is read on. */
export function lineRate(now: () => number): LineRate {
  // The account touched longest ago first: a Map keeps insertion order, and a touched account goes to the back.
  const accounts = new Map<string, { touched: number; seen: Seen[] }>();
  return {
    add: (account, { id, at, lines }) => {
      const wall = now();
      for (const [key, { touched }] of accounts) {
        if (touched > wall - MS) break;
        accounts.delete(key);
      }
      const seen = accounts.get(account)?.seen ?? [];
      accounts.delete(account);
      if (!seen.some((each) => each.id === id)) seen.push({ id, at, lines });
      // 101 messages hold more than the limit, so an older one is never needed to say a flood is one.
      if (seen.length > LIMIT + 1) seen.shift();
      accounts.set(account, { touched: wall, seen });
      const inMinute = seen.filter((each) => each.at > at - MS && each.at <= at);
      return inMinute.reduce((sum, each) => sum + each.lines, 0) > LIMIT;
    },
    held: () => [...accounts.values()].reduce((sum, { seen }) => sum + seen.length, 0),
  };
}
