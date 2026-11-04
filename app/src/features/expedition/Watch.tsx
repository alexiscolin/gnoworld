// What slice 8's discovery keeps doing while a chat session is open, mounted by the shell's watcher (8a's `discoveryWatch` slot), drawing
// nothing: the quests' talk steps, watched in the chat's store.
import { useEffect } from "react";
import { useAppStore } from "../../storeContext.tsx";
import { watchTalk } from "../quests/index.ts";

export function DiscoveryWatch() {
  const store = useAppStore();
  useEffect(() => watchTalk(store), [store]);
  return null;
}
