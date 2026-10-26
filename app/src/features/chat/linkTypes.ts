// What the chat's link takes and offers (link.ts), apart from how it does it.
import type { Result } from "../../lib/api/http.ts";
import type { Ergo, ErgoOptions, Who } from "../../lib/ergo/ergo.ts";
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
}

export interface ChatLink {
  /** The rooms the world lists, in its order. */
  follow: (ids: readonly string[]) => void;
  /** The room in view: its history is asked once Ergo says I joined it, once a connection. */
  show: (room: string | undefined) => void;
  /** Sends a draft, as the composer composes it, to a room Ergo says it is in; an account's alone. Whether it went. */
  say: (room: string, draft: string) => boolean;
  /** Sends a draft to another account, a direct message (4e); an account's alone. Whether it went. */
  sayTo: (partner: string, draft: string) => boolean;
  stop: () => void;
}
