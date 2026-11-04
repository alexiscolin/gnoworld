// Follow (ADR-0002 §1, Follow; slice 8): a world or a person, kept on this device alone, the last followed first. A world is named as the
// device keys it ("universe:world", core's stampKey), a person by their account's address, never a nick. Nothing of it leaves the device.
import { FOLLOWS_KEPT, type DeviceFields } from "../../lib/keep/fields.ts";
import { useApp, useAppStore } from "../../storeContext.tsx";

/** What is followed: worlds, or people. */
export type FollowKind = keyof DeviceFields["follows"];

/** The list with `id` taken out if it was in, or put first if it was not; the oldest dropped past FOLLOWS_KEPT. */
function toggled(list: readonly string[], id: string): string[] {
  return list.includes(id) ? list.filter((one) => one !== id) : [id, ...list].slice(0, FOLLOWS_KEPT);
}

/** Whether `id` is followed, and the way to follow it or stop: the toggle says whether the device kept the change. */
export function useFollow(kind: FollowKind, id: string): { following: boolean; toggle: () => boolean } {
  const store = useAppStore();
  const following = useApp(({ device }) => device.follows[kind].includes(id));
  return {
    following,
    toggle: () =>
      store.getState().deviceActions.change("follows", (held) => ({ ...held, [kind]: toggled(held[kind], id) })),
  };
}
