// The one store (docs/ARCHITECTURE.md, "State"): a slice per feature, here so the store imports no feature.
// React reads it through zustand's useStore in the features; the scene through subscribe.
import { createStore } from "zustand/vanilla";
import { chatSlice, type ChatSlice } from "./chat.ts";
import { dmSlice, type DmSlice } from "./dms.ts";
import { loginSlice, type LoginSlice } from "./login.ts";

export type AppState = LoginSlice & ChatSlice & DmSlice;

/** A store of its own: the page makes one, each test another. */
export const createAppStore = () =>
  createStore<AppState>()((...args) => ({
    ...loginSlice(...args),
    ...chatSlice(...args),
    ...dmSlice(...args),
  }));
