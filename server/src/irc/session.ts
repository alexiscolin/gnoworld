// What the server's IRC link remembers of one connection to Ergo (slice 3's plan, 3h, 3j, 3l, 3m).
import { roomStates, type States } from "./state.ts";

export interface State {
  attempt: number;
  // When the link last came in: the backoff starts again only after a minute up.
  upSince?: number | undefined;
  joined: Set<string>;
  ready: boolean;
  // Each chathistory batch open, by its reference: its room, its lines and the last one's time.
  batches: Map<string, { room: string; lines: number; last: string }>;
  // The time each room's history was last asked after, so a page that makes no progress is passed.
  after: Map<string, string>;
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
  batches: new Map(),
  after: new Map(),
  asked: new Set(),
  channels: undefined,
  states: roomStates(stateMs),
  nickTaken: 0,
});
