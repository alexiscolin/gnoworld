// The one store (docs/ARCHITECTURE.md, "State"): a slice per feature, here so the store imports no feature.
// React reads it through zustand's useStore in the features; the scene through subscribe.
import { createStore, type StoreApi } from "zustand/vanilla";
import type { CallsSlice } from "../lib/calls.ts";
import { chatSlice, type ChatSlice } from "./chat.ts";
import { dmSlice, type DmSlice } from "./dms.ts";
import { keepSlice, type KeepSlice } from "./keep.ts";
import { loginSlice, type LoginSlice } from "./login.ts";
import { noticeSlice, type NoticeSlice } from "./notices.ts";
import { pinsSlice, type PinsSlice } from "./pins.ts";
import { signalsSlice, type SignalsSlice } from "./signals.ts";
import { verdictsSlice, type VerdictsSlice } from "./verdicts.ts";

type BaseState = LoginSlice & ChatSlice & DmSlice & NoticeSlice & VerdictsSlice & KeepSlice & PinsSlice & SignalsSlice;
// The calls' slice (lib/calls.ts) is added when a realm view draws its first card: its part of the state is absent until then.
export type AppState = BaseState & CallsSlice;

/** A store of its own: the page makes one, each test another. */
export const createAppStore = () => {
  const made = createStore<BaseState>()((...args) => ({
    ...loginSlice(...args),
    ...chatSlice(...args),
    ...dmSlice(...args),
    ...noticeSlice(...args),
    ...verdictsSlice(...args),
    ...keepSlice(...args),
    ...pinsSlice(...args),
    ...signalsSlice(...args),
  }));
  // The calls' part is typed present and added by `ensureCalls`; no reader asks for it before.
  const store = made as StoreApi<AppState>;
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
