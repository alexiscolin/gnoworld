// What the server's IRC link remembers of one connection to Ergo, and the lines it reads to keep it (slice 3's
// plan, 3h, 3j, 3l, 3m).
import { freshHistory, type HistoryState } from "./history.ts";
import { roomStates, type States } from "./state.ts";

export interface State extends HistoryState {
  attempt: number;
  // When the link last came in: the backoff starts again only after a minute up.
  upSince?: number | undefined;
  joined: Set<string>;
  ready: boolean;
  // The rooms joined by send since this connection began, taken as joined once Ergo says so (3l).
  asked: Set<string>;
  // The channels of a LIST under way, 10,000 at most.
  channels: string[] | undefined;
  // The rooms' states asked of Ergo (3m).
  states: States;
  // Its nick refused in a row, connection after connection: the third raises the alert (slice 3's max review).
  nickTaken: number;
}

export const fresh = (stateMs: number): State => ({
  attempt: 0,
  joined: new Set(),
  ready: false,
  ...freshHistory(),
  asked: new Set(),
  channels: undefined,
  states: roomStates(stateMs),
  nickTaken: 0,
});
