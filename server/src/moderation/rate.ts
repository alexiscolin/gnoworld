// A second rate rule, beside check.ts's 20 messages a minute (decisions f0c19ce, F1123): 100 lines a minute an account,
// a message of several lines counting each of its lines. Counted in memory, so a restart forgets it and the database
// keeps its shape.
const LIMIT = 100;
const MS = 60_000;
const ACCOUNTS = 10_000;

/** A message: its id, Ergo's time for it and its lines. */
interface Seen {
  id: string;
  at: number;
  lines: number;
}

export interface LineRate {
  /** Counts a message, once for its id; whether the account is past the limit in the minute before it. */
  add: (account: string, message: Seen) => boolean;
  /** The messages held, all accounts: bounded by 10,000 accounts of 101 messages each. */
  held: () => number;
}

/** The lines each account sent; the account touched longest ago is forgotten past 10,000, never by time (F1710, F1727). */
export function lineRate(): LineRate {
  // The account touched longest ago first: a Map keeps insertion order, and a touched account goes to the back.
  const accounts = new Map<string, Seen[]>();
  return {
    add: (account, { id, at, lines }) => {
      const seen = accounts.get(account) ?? [];
      accounts.delete(account);
      if (!seen.some((each) => each.id === id)) seen.push({ id, at, lines });
      // 101 messages hold more than the limit, so an older one is never needed to say a flood is one.
      if (seen.length > LIMIT + 1) seen.shift();
      accounts.set(account, seen);
      // The check queue's own cap on lines: a backlog serves lines minutes after Ergo stamped them, so no clock decides.
      if (accounts.size > ACCOUNTS) accounts.delete(accounts.keys().next().value ?? account);
      const inMinute = seen.filter((each) => each.at > at - MS && each.at <= at);
      return inMinute.reduce((sum, each) => sum + each.lines, 0) > LIMIT;
    },
    held: () => [...accounts.values()].reduce((sum, seen) => sum + seen.length, 0),
  };
}
