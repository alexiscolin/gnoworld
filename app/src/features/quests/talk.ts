// A quest's talk step (slice 8): done once the reader's own message shows in the hub's main room the step names, whether the reader just
// said it or the room's history brought it back. Only the rooms a quest names are looked at, and only when their record changes.
import type { StoreApi } from "zustand/vanilla";
import { site } from "../../places.ts";
import type { AppState } from "../../store/index.ts";
import { stepsDone, withSteps } from "./progress.ts";

/** Watches the store until the returned function is called. */
export function watchTalk(store: StoreApi<AppState>): () => void {
  const steps = new Map<string, [string, string][]>();
  return store.subscribe((state, before) => {
    const me = state.chat.me;
    if (me === undefined) return;
    for (const [room, held] of Object.entries(state.chat.rooms)) {
      if (held === before.chat.rooms[room]) continue;
      if (!steps.has(room))
        steps.set(
          room,
          site.universes.flatMap(({ id }) => stepsDone(id, { room })),
        );
      const pairs = steps.get(room) ?? [];
      if (pairs.length === 0 || !held.lines.some((line) => line.from === me && line.kind === "message")) continue;
      state.deviceActions.change("quests", (progress) => withSteps(progress, pairs));
    }
  });
}
