// Direct messages' slice of the store (slice 4's 4e): each conversation an account has with another, by that
// account, its newest lines in time order, each once. Ergo's lines reach it as they reach the rooms' slice; a
// guest has none, nor does a partner that is no account's address.
import { addLines, dmOf, type IrcMessage, type Line } from "@gnoworld/core";
import { Address } from "@gnoworld/schemas";
import type { StateCreator } from "zustand/vanilla";
import { LINES_KEPT, type ChatSlice } from "./chat.ts";

export interface DmSlice {
  /** Direct messages by the account they are with, each its newest lines (the store's window). */
  dms: Readonly<Record<string, readonly Line[]>>;
  dmActions: {
    /** One live line from Ergo: a direct message is kept with its partner; any other changes nothing. */
    heard: (message: IrcMessage) => void;
  };
}

export const dmSlice: StateCreator<ChatSlice & DmSlice, [], [], DmSlice> = (set, get) => ({
  dms: {},
  dmActions: {
    heard: (message) => {
      const { chat, dms } = get();
      const me = Address.safeParse(chat.me);
      const dm = me.success ? dmOf(message, me.data) : undefined;
      if (dm === undefined || !Address.safeParse(dm.partner).success) return;
      const held = dms[dm.partner] ?? [];
      const lines = addLines(held, [dm.line], LINES_KEPT);
      if (lines !== held) set({ dms: { ...dms, [dm.partner]: lines } });
    },
  },
});
