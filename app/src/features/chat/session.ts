// What a new session of the chat's link starts the store's device-bound state with (slice 4's 4d, 4e): an account's own
// read from its device, none for a guest; the last session's was forgotten by the store itself (store/index.ts).
import type { IrcMessage } from "@gnoworld/core";
import type { AppState } from "../../store/index.ts";
import type { LinkDeps } from "./linkTypes.ts";

export function beginSession({ store, device, keep }: LinkDeps, session: AppState["login"]["session"]): void {
  const account = session.kind === "in" ? session.address : undefined;
  const { dmActions, keepActions, noticeActions } = store.getState();
  const kept = account === undefined ? undefined : device?.(account);
  dmActions.begin(kept);
  noticeActions.begin(kept?.notices);
  keepActions.begin(account === undefined ? undefined : keep?.(account));
}

/** One live line from Ergo to each slice that reads lines: the rooms', the direct messages', the saved lines' and the
 * pins' (a REDACT, an edit). */
export function heardBy(store: LinkDeps["store"], message: IrcMessage): void {
  const { chatActions, dmActions, keepActions, pinsActions } = store.getState();
  chatActions.heard(message);
  dmActions.heard(message);
  keepActions.heard(message);
  pinsActions.heard(message);
}
