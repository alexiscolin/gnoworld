// What the chat's link takes and offers (link.ts), apart from how it does it.
import type { Result } from "../../lib/api/http.ts";
import type { Ergo, ErgoOptions, Who } from "../../lib/ergo/ergo.ts";
import type { Keep } from "../../lib/keep/keep.ts";
import type { DmDevice } from "../../store/dms.ts";
import type { createAppStore } from "../../store/index.ts";
import type { Address } from "@gnoworld/schemas";

export interface LinkDeps {
  store: ReturnType<typeof createAppStore>;
  connect: (who: Who, on: Pick<ErgoOptions, "onState" | "onLine">) => Ergo;
  ticket: () => Promise<Result<{ ticket: string }>>;
  guest: () => string;
  /** An account's device, whose direct-message choices the store reads at its session's start; none in a test. */
  device?: ((account: Address) => DmDevice) | undefined;
  /** An account's saved lines and reading places on its device, which the store reads at its session's start; none in
   * a test. */
  keep?: ((account: Address) => Keep) | undefined;
}

export interface ChatLink {
  /** The rooms the world lists, in its order. */
  follow: (ids: readonly string[]) => void;
  /** The room in view: its history asked once Ergo says I joined it, once a connection; the last one's place told. */
  show: (room: string | undefined) => void;
  /** Sends a draft, as the composer composes it, to a room Ergo says it is in; an account's alone. Whether it went. */
  say: (room: string, draft: string) => boolean;
  /** Sends a draft to another account, a direct message (4e); an account's alone. Whether it went. */
  sayTo: (partner: string, draft: string) => boolean;
  /** Deletes a line by its msgid in a room Ergo says it is in (Ergo's REDACT, 4c); an account's alone. Whether it went. */
  redact: (room: string, id: string) => boolean;
  /** Tells a room Ergo says it is in the account is typing, at most each 3 s, or done after (+typing); an account's. */
  typing: (room: string, state: "active" | "done") => void;
  /** Marks the room in view read to its line `id`, which the store holds, as Ergo's MARKREAD (draft/read-marker): an
   * account's alone, a line past the place Ergo gave; asked while away, it goes once Ergo says I am in the room. */
  read: (room: string, id: string) => void;
  /** Sends at once the reading places waiting their 2 s, as the page hides (F940). */
  flush: () => void;
  stop: () => void;
}
