// The one store (docs/ARCHITECTURE.md, "State"): a slice per feature, here so the store imports no feature.
// React reads it through zustand's useStore in the features; the scene through subscribe.
import { createStore } from "zustand/vanilla";
import { chatSlice, type ChatSlice } from "./chat.ts";
import { dmSlice, type DmSlice } from "./dms.ts";
import { keepSlice, type KeepSlice } from "./keep.ts";
import { loginSlice, type LoginSlice } from "./login.ts";
import { noticeSlice, type NoticeSlice } from "./notices.ts";
import { pinsSlice, type PinsSlice } from "./pins.ts";
import { verdictsSlice, type VerdictsSlice } from "./verdicts.ts";

export type AppState = LoginSlice & ChatSlice & DmSlice & NoticeSlice & VerdictsSlice & KeepSlice & PinsSlice;

/** A store of its own: the page makes one, each test another. */
export const createAppStore = () => {
  const store = createStore<AppState>()((...args) => ({
    ...loginSlice(...args),
    ...chatSlice(...args),
    ...dmSlice(...args),
    ...noticeSlice(...args),
    ...verdictsSlice(...args),
    ...keepSlice(...args),
    ...pinsSlice(...args),
  }));
  // A session that follows another leaves nothing of the last one's rooms, notices, conversations, saved lines or pins,
  // whether or not the chat is open to begin the new one (the link then reads its account's device). The first session,
  // from none, has none to leave. This is the one place that ends a session's state (F2091).
  const who = ({ login }: AppState) => (login.session.kind === "in" ? login.session.address : login.session.kind);
  store.subscribe((state, before) => {
    if (before.login.session.kind === "unknown" || state.login.session.kind === "unknown") return;
    if (who(state) === who(before)) return;
    state.chatActions.follow([]);
    state.keepActions.begin(undefined);
    state.pinsActions.forget();
    state.dmActions.begin();
    state.noticeActions.begin();
  });
  return store;
};
