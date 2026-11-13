// Each world's unseen lines, for the full chat's column: asked on opening, on focus and every 30 s while the chat shows, and the places
// this page holds forwarded as Ergo confirms them. A guest, or a chat that is closed, asks and forwards nothing; a call that fails keeps
// the last number.
import type { Unread } from "@gnoworld/schemas";
import { useEffect, useState } from "react";
import { pageUnreadApi, type UnreadApi } from "../../lib/api/unread.ts";
import { useApp, useAppStore } from "../../storeContext.tsx";
import { forwardPlaces } from "./unreadPlaces.ts";

const EVERY_MS = 30_000;
const FORWARD_EVERY_MS = 5_000;
const NONE: Unread["worlds"] = {};
const PAGE = pageUnreadApi();

/** The count of each world with lines unseen, by its slug; none while `on` is false or the reader is a guest. */
export function useUnread(on: boolean, api: UnreadApi = PAGE): Unread["worlds"] {
  const store = useAppStore();
  const account = useApp(({ login }) => login.session.kind === "in");
  const [worlds, setWorlds] = useState(NONE);
  const active = on && account;
  const { counts, places } = api;
  useEffect(() => {
    if (!active) return;
    let live = true;
    const ask = (): void => {
      counts().then(
        (got) => {
          if (live && got.ok) setWorlds(got.value.worlds);
        },
        () => undefined,
      );
    };
    ask();
    const timer = setInterval(ask, EVERY_MS);
    addEventListener("focus", ask);
    const stop = forwardPlaces(store, async (placed) => (await places(placed)).ok, { everyMs: FORWARD_EVERY_MS });
    return () => {
      live = false;
      // A log out or a close leaves nothing for the next account to see before its own answer.
      setWorlds(NONE);
      clearInterval(timer);
      removeEventListener("focus", ask);
      stop();
    };
  }, [active, counts, places, store]);
  return active ? worlds : NONE;
}
