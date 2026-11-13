// Who follows the stream, counted at each ask (D352, D374); the stream's clients, seen by what is counted of them.
export interface Watcher {
  /** The worlds it counts on, the stream's own choice (stream.ts). */
  readonly counted: ReadonlySet<string>;
  readonly account: string | undefined;
  readonly visitor: string;
}

// Who has a stream open (D352): a guest once by its visitor, whatever its streams and tabs; an account once. ponytail: counted at each
// ask, over 2,000 clients at most.
export function watchingOf(clients: ReadonlySet<Watcher>): { guests: number; accounts: ReadonlySet<string> } {
  const accounts = new Set<string>();
  const guests = new Set<string>();
  for (const { account, visitor } of clients) {
    if (account === undefined) guests.add(visitor);
    else accounts.add(account);
  }
  return { guests: guests.size, accounts };
}

// Who follows each world (D374): a guest once by its visitor key, whatever its streams on that world, an account once; a guest on two
// worlds counts on each. ponytail: counted at each ask, 2,000 clients at most and 25 rooms each.
export function watchingIn(
  clients: ReadonlySet<Watcher>,
): ReadonlyMap<string, { guests: number; accounts: ReadonlySet<string> }> {
  const held = new Map<string, { guests: Set<string>; accounts: Set<string> }>();
  for (const { counted, account, visitor } of clients)
    for (const world of counted) {
      const here = held.get(world) ?? { guests: new Set<string>(), accounts: new Set<string>() };
      if (account === undefined) here.guests.add(visitor);
      else here.accounts.add(account);
      held.set(world, here);
    }
  return new Map([...held].map(([world, { guests, accounts }]) => [world, { guests: guests.size, accounts }]));
}
