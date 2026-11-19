// What the server's IRC link remembers of one connection to Ergo, and the lines it reads to keep it.
import type { Socket } from "node:net";
import type { IrcMessage } from "@gnoworld/core";
import { marks } from "./lines.ts";
import type { Relayed } from "./relay.ts";
import { makeRedacts, type Redacts } from "./redacts.ts";
import { freshHistory, type HistoryState } from "./history.ts";
import { several, type Several } from "./several.ts";
import { roomStates, type States } from "./state.ts";

export interface State extends HistoryState {
  attempt: number;
  // When the link last came in: the backoff starts again only after a minute up.
  upSince?: number | undefined;
  joined: Set<string>;
  ready: boolean;
  // Each message of several lines open (draft/multiline), by its reference: held until its end, then read as one.
  several: Several;
  // The rooms joined by send since this connection began, taken as joined once Ergo says so.
  asked: Set<string>;
  // The channels of a LIST under way, 10,000 at most.
  channels: string[] | undefined;
  // The rooms' states asked of Ergo.
  states: States;
  // Its nick refused in a row, connection after connection: the third raises the alert.
  nickTaken: number;
  // The hides sent and not yet taken, asked again when Ergo does not know the line yet.
  redacts: Redacts;
  // The relays sent and not yet answered, by the label Ergo sends back: each settles once, with whether Ergo took it.
  relays: Map<string, (took: Relayed) => void>;
}

export const fresh = (stateMs: number, lineMs: number): State => ({
  attempt: 0,
  joined: new Set(),
  ready: false,
  several: several(),
  ...freshHistory(lineMs),
  asked: new Set(),
  channels: undefined,
  states: roomStates(stateMs),
  nickTaken: 0,
  redacts: makeRedacts(),
  relays: new Map(),
});

/** A connection's end: what it held is forgotten, each question still waiting answered with nothing. */
export function forget(state: State): void {
  state.ready = false;
  state.batches.clear();
  state.several.clear();
  state.turns = [];
  state.page = undefined;
  state.asked.clear();
  state.channels = undefined;
  state.states.drop();
  state.lines.drop();
  state.redacts.clear();
  // A relay waiting on a connection that ended may have been taken before it: unsure, never refused.
  for (const settle of state.relays.values()) settle("unsure");
  state.relays.clear();
}

/** A command just sent: a JOIN is taken as joined once Ergo says so, a REDACT waits for Ergo's word. */
export function sentOn(state: State, command: string, params: readonly string[]): void {
  if (command === "JOIN") state.asked.add(params[0] ?? "");
  else if (command === "REDACT") state.redacts.sent(params);
}

/** The answer to a relay carries its label: a FAIL or an error number refuses it, the line itself or an ACK takes it. */
function relayAnswered(state: State, { tags, command }: IrcMessage): void {
  const label = tags.get("label");
  if (label === undefined) return;
  const { time } = marks(tags);
  state.relays.get(label)?.(
    command === "FAIL" || /^[45]\d\d$/.test(command)
      ? false
      : { msgid: tags.get("msgid") ?? "", ...(time === undefined ? {} : { time }) },
  );
}

/** A reader that first settles the relay an answer's label names, then reads the line as it does. */
export const answering =
  (state: State, read: (socket: Socket, message: IrcMessage) => void) =>
  (socket: Socket, message: IrcMessage): void => {
    relayAnswered(state, message);
    read(socket, message);
  };
