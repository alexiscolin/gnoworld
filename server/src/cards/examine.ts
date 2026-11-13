// One page of the link cards, read (or its stored answer reused) and checked (slice 13, L3), what the queue's job does before the lines
// waiting on it are told.
import type { Log } from "@gnoworld/service/log";
import type { Thresholds } from "../moderation/decide.ts";
import type { CardFlowOptions } from "./flow.ts";
import { answerOf, checkCard, readCard, stateAfter } from "./read.ts";
import type { CardStore, State } from "./store.ts";

export interface Job {
  account: string;
  key: string;
  url: string;
  recheck: boolean;
}

interface Deps extends Pick<CardFlowOptions, "reader" | "check"> {
  store: CardStore;
  thresholds: Thresholds;
  log: Log;
}

/** The state the page takes, stored; none when the reader failed (down, or an answer no schema takes). */
export async function examine(
  { store, reader, check, thresholds, log }: Deps,
  { key, url, recheck }: Job,
): Promise<State | undefined> {
  const host = new URL(url).hostname;
  const stored = recheck ? store.page(key) : undefined;
  const card = (stored && answerOf(stored)) ?? (await readCard(reader, url));
  if (typeof card === "string") {
    if (card === "shape") log("alert", { error: "card_shape" });
    store.put(key, { state: card === "down" ? "down" : "unchecked", host });
    return undefined;
  }
  const state = stateAfter(await checkCard(check, card), thresholds);
  store.put(key, { state, host }, state === "failed" ? undefined : card);
  return state;
}
