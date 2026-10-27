// The one store (docs/ARCHITECTURE.md, "State"): a slice per feature, here so the store imports no feature.
// React reads it through zustand's useStore in the features; the scene through subscribe.
import { createStore } from "zustand/vanilla";
import { chatSlice, type ChatSlice } from "./chat.ts";
import { dmSlice, type DmSlice } from "./dms.ts";
import { loginSlice, type LoginSlice } from "./login.ts";
import { noticeSlice, type NoticeSlice } from "./notices.ts";
import { verdictsSlice, type VerdictsSlice } from "./verdicts.ts";

export type AppState = LoginSlice & ChatSlice & DmSlice & NoticeSlice & VerdictsSlice;

/** A store of its own: the page makes one, each test another. */
export const createAppStore = () => {
  const store = createStore<AppState>()((...args) => ({
    ...loginSlice(...args),
    ...chatSlice(...args),
    ...dmSlice(...args),
    ...noticeSlice(...args),
    ...verdictsSlice(...args),
  }));
  // A session that follows another leaves nothing of the last one's notices or conversations, whether or not the chat is
  // open to begin the new one (the link then reads its account's device). The first session, from none, has none to leave.
  const who = ({ login }: AppState) => (login.session.kind === "in" ? login.session.address : login.session.kind);
  store.subscribe((state, before) => {
    if (before.login.session.kind === "unknown" || state.login.session.kind === "unknown") return;
    if (who(state) === who(before)) return;
    state.dmActions.begin();
    state.noticeActions.begin();
  });
  return store;
};
