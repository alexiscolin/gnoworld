// The one store (docs/ARCHITECTURE.md, "State"): a slice per feature, here so the store imports no feature.
// React reads it through zustand's useStore in the features; the scene through subscribe.
import { createStore } from "zustand/vanilla";
import { chainSlice, type ChainSlice } from "./chain.ts";
import { chatSlice, type ChatSlice } from "./chat.ts";
import { jumpSlice, type JumpSlice } from "./chatJump.ts";
import { dmSlice, type DmSlice } from "./dms.ts";
import { deviceSlice, keepSlice, type DeviceSlice, type KeepSlice } from "./keep.ts";
import { loginSlice, type LoginSlice } from "./login.ts";
import { noticeSlice, type NoticeSlice } from "./notices.ts";
import { pinsSlice, type PinsSlice } from "./pins.ts";
import { signalsSlice, type SignalsSlice } from "./signals.ts";
import { verdictsSlice, type VerdictsSlice } from "./verdicts.ts";

export type AppState = LoginSlice &
  ChatSlice &
  JumpSlice &
  DmSlice &
  NoticeSlice &
  VerdictsSlice &
  KeepSlice &
  PinsSlice &
  DeviceSlice &
  SignalsSlice &
  ChainSlice & {
    /** The page's Adena, set by a call card's first gesture so the login follows its account (F5651). Absent until then. */
    wallet?: unknown;
  };
// The calls' slice (lib/calls.ts) is added when a realm view draws its first card, so it is not in this type: features/calls/slice.ts
// reads it through `callsIn`, which says when it is absent.

const who = ({ login }: AppState) => (login.session.kind === "in" ? login.session.address : login.session.kind);

/** Whether a session followed another: the first one, from none, is no change. */
export const sessionChanged = (state: AppState, before: AppState): boolean =>
  before.login.session.kind !== "unknown" && state.login.session.kind !== "unknown" && who(state) !== who(before);

/** A store of its own: the page makes one, each test another. */
export const createAppStore = () => {
  const store = createStore<AppState>()((...args) => ({
    ...loginSlice(...args),
    ...chatSlice(...args),
    ...jumpSlice(...args),
    ...dmSlice(...args),
    ...noticeSlice(...args),
    ...verdictsSlice(...args),
    ...keepSlice(...args),
    ...pinsSlice(...args),
    ...deviceSlice(...args),
    ...signalsSlice(...args),
    ...chainSlice(...args),
  }));
  // A session that follows another leaves nothing of the last one's rooms, notices, conversations, saved lines or pins,
  // whether or not the chat is open to begin the new one (the link then reads its account's device). The first session,
  // from none, has none to leave. This is the one place that ends a session's state (F2091).
  store.subscribe((state, before) => {
    if (!sessionChanged(state, before)) return;
    state.chatActions.follow([]);
    state.keepActions.begin(undefined);
    state.pinsActions.forget();
    state.dmActions.begin();
    state.noticeActions.begin();
  });
  return store;
};
