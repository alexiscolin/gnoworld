// What a link holds of an account's half (accountKit.ts), apart from link.ts: the half itself, once made; the rooms where
// a mention of the whole room counts, told to it when it comes; and the wait for its code, asked when an account's
// connection needs it, the connection opened once it came, unless the session ended meanwhile, and opened to read alone
// when the code could not be fetched.
import type { Kit, KitHost, MakeKit } from "./accountKit.ts";

export class Kitting {
  #kit: Kit | undefined;
  #groups: ReadonlySet<string> = new Set();
  readonly #host: KitHost;
  readonly #load: (() => Promise<MakeKit>) | undefined;

  /** `made`: the half at hand (a test's); `load`: how to ask for its code. */
  constructor(
    host: KitHost,
    { made, load }: { made?: MakeKit | undefined; load?: (() => Promise<MakeKit>) | undefined },
  ) {
    this.#host = host;
    this.#load = load;
    if (made !== undefined) this.#adopt(made);
  }

  get kit(): Kit | undefined {
    return this.#kit;
  }

  groups(rooms: ReadonlySet<string>): void {
    this.#groups = rooms;
    this.#kit?.groups(rooms);
  }

  /** Calls `connect`: at once, or when the half came if `account` says the connection is an account's and it is not here. */
  connectWhen(account: boolean, live: () => boolean, connect: () => void): void {
    if (!account || this.#kit !== undefined || this.#load === undefined) {
      connect();
      return;
    }
    const opened = () => {
      if (live()) connect();
    };
    void this.#load().then((make) => {
      this.#adopt(make);
      opened();
    }, opened);
  }

  #adopt(make: MakeKit): void {
    this.#kit ??= make(this.#host);
    this.#kit.groups(this.#groups);
  }
}
