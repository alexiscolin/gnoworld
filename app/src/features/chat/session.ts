// What a new session of the chat's link starts the store's device-bound state with (slice 4's 4d, 4e): the last session's
// is forgotten, an account's own read from its device, none for a guest, and the last reader's right to pin dropped.
import type { IrcMessage } from "@gnoworld/core";
import type { AppState } from "../../store/index.ts";
import type { LinkDeps } from "./linkTypes.ts";

export function beginSession({ store, device, keep }: LinkDeps, session: AppState["login"]["session"]): void {
  const account = session.kind === "in" ? session.address : undefined;
  const { dmActions, keepActions, pinsActions } = store.getState();
  dmActions.begin(account === undefined ? undefined : device?.(account));
  keepActions.begin(account === undefined ? undefined : keep?.(account));
  pinsActions.forget();
}

/** One live line from Ergo to each slice that reads lines: the rooms', the direct messages' and the pins' (a REDACT). */
export function heardBy(store: LinkDeps["store"], message: IrcMessage): void {
  const { chatActions, dmActions, pinsActions } = store.getState();
  chatActions.heard(message);
  dmActions.heard(message);
  pinsActions.heard(message);
}
