// Watches the quests' talk steps in the chat's store while a chat session is open; mounted by the shell's `discoveryWatch` slot, draws nothing.
import { useEffect } from "react";
import { useAppStore } from "../../storeContext.tsx";
import { watchTalk } from "../quests/index.ts";

export function DiscoveryWatch() {
  const store = useAppStore();
  useEffect(() => watchTalk(store), [store]);
  return null;
}
