// The lines Ergo sends that the link answers or keeps in its state: its LIST, its login by SASL, the refusals that
// close it, who joins its rooms, the rooms that refuse it and the kick that puts it out (slice 3's plan, 3h, 3l,
// 3m and its max review).
import type { Socket } from "node:net";
import type { IrcMessage } from "@gnoworld/core";
import type { Log } from "@gnoworld/service/log";
import { line, NICK } from "./lines.ts";
import type { State } from "./session.ts";

// Ergo's LIST, its channels kept to 10,000, handed on at its end (3l).
export function listing(
  state: State,
  onChannels: ((names: readonly string[]) => void) | undefined,
): Record<string, (s: Socket, message: IrcMessage) => void> {
  return {
    "322": (_, { params: [, name] }) => {
      if (name?.startsWith("#") === true && state.channels !== undefined && state.channels.length < 10_000) {
        state.channels.push(name);
      }
    },
    "323": () => {
      if (state.channels !== undefined) onChannels?.(state.channels);
      state.channels = undefined;
    },
  };
}

// Its account by SASL PLAIN, the operator's password as its passphrase, which the server's auth script takes
// for gnoworld alone (slice 3's max review); an ACK without sasl sends no password, and a refusal closes.
export function sasl(
  password: string,
  refused: (s: Socket, error: string) => void,
): Record<string, (s: Socket, message: IrcMessage) => void> {
  const refuse = (s: Socket): void => {
    refused(s, "sasl");
  };
  return {
    CAP: (s, { params }) => {
      if (params[1] === "ACK" && (params[2] ?? "").split(" ").includes("sasl"))
        s.write(line("AUTHENTICATE", ["PLAIN"]));
      else if (params[1] === "ACK" || params[1] === "NAK") refused(s, "cap");
    },
    AUTHENTICATE: (s, { params: [challenge] }) => {
      if (challenge === "+") s.write(line("AUTHENTICATE", [Buffer.from(`\0${NICK}\0${password}`).toString("base64")]));
    },
    "903": (s) => s.write(line("CAP", ["END"])),
    "902": refuse,
    "904": refuse,
    "905": refuse,
    "906": refuse,
  };
}

// The refusals Ergo will not change by itself: a nick taken (433), a wrong oper password (464, 491). A nick
// taken three times in a row is no ghost's (OPERATIONS.md): ops hears of it, once until the bot is back.
export function refusals(
  refused: (s: Socket, error: string) => void,
  state: State,
  log: Log,
): Record<string, (s: Socket) => void> {
  return {
    "433": (s) => {
      state.nickTaken += 1;
      if (state.nickTaken === 3) log("alert", { error: "irc_nick_taken" });
      refused(s, "nick");
    },
    "464": (s) => {
      refused(s, "oper");
    },
    "491": (s) => {
      refused(s, "oper");
    },
  };
}

// Ergo's JOIN: the bot's own takes a room it asked as joined (3l); another's, in one of its rooms, is
// handed on (3m).
export function joined(
  state: State,
  onJoin: (room: string) => void,
  catchUp: (s: Socket, room: string) => void,
): (s: Socket, message: IrcMessage) => void {
  return (s, { source, params: [room = ""] }) => {
    if (source?.split("!")[0] !== NICK) {
      if (state.joined.has(room)) onJoin(room);
      return;
    }
    if (state.asked.has(room)) state.joined.add(room);
    if (state.joined.has(room)) catchUp(s, room);
  };
}

// The bot kicked out of a room of its own, by an operator: back by SAJOIN at once, and logged.
export function kicked(state: State, log: Log): (s: Socket, message: IrcMessage) => void {
  return (s, { params: [room = "", who = ""] }) => {
    if (who !== NICK || !state.joined.has(room)) return;
    log("irc_kicked", { room });
    s.write(line("SAJOIN", [room]));
  };
}

// A room of its own that refuses the bot (3m: +i, +R, or an operator's +l, +k or +b) is joined by
// SAJOIN, which Ergo grants an operator whatever the room's modes (irc/channel.go:786-792, v2.19.1).
export function rejoins(state: State): Record<string, (s: Socket, message: IrcMessage) => void> {
  const rejoin = (s: Socket, { params: [, room = ""] }: IrcMessage): void => {
    if (state.joined.has(room) || state.asked.has(room)) s.write(line("SAJOIN", [room]));
  };
  return Object.fromEntries(["471", "473", "474", "475", "477"].map((code) => [code, rejoin]));
}
