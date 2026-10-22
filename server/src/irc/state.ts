// A room's state as the link reads it from Ergo (slice 3's plan, 3m): MODE gives its flags (324), SAMODE I
// its invite list (346, 347), NAMES who is in it with their prefixes (353, 366), answered in that order.
// Ergo's text is read, never trusted: a nick with a space, a comma or a control character is left out.
import type { IrcMessage } from "@gnoworld/core";
import type { RoomState } from "../rooms/reconcile.ts";

// A question under way: what Ergo said so far, how to answer it, and when it gives up.
interface Asked {
  flags: string | undefined;
  invites: string[];
  present: RoomState["present"];
  room: string;
  promise: Promise<RoomState | undefined>;
  resolve: (state: RoomState | undefined) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface States {
  // Asked once per room at a time; undefined when Ergo says no such room or does not answer in time.
  ask: (write: (command: string, params: readonly string[]) => void, room: string) => Promise<RoomState | undefined>;
  read: (message: IrcMessage) => void;
  // The connection closed: each question answered with nothing.
  drop: () => void;
}

export function roomStates(timeoutMs: number): States {
  // More than any room of ours holds: Ergo's list is 100 entries, a room's people a few thousand.
  const MAX = 10_000;
  const asked = new Map<string, Asked>();
  const done = (state: Asked, answer: RoomState | undefined): void => {
    clearTimeout(state.timer);
    asked.delete(state.room);
    state.resolve(answer);
  };
  const handlers: Readonly<Record<string, (state: Asked, params: readonly string[]) => void>> = {
    "324": (state, [, , flags = ""]) => {
      state.flags = flags.replace(/^\+/, "");
    },
    // An invite Ergo writes as a mask, nick!*@*: the account it names; any other mask as it is.
    "346": (state, [, , mask = ""]) => {
      const [, account] = /^([^!@*?]+)!\*@\*$/.exec(mask) ?? [];
      if (state.invites.length < MAX) state.invites.push(account ?? mask);
    },
    // Before its 324, a NAMES answers the bot's own JOIN, written just before the question (F579).
    "353": (state, [, , , names = ""]) => {
      if (state.flags === undefined) return;
      for (const name of names.split(" ")) {
        const [, powers = "", nick = ""] = /^([~&@%+]*)(.*)$/s.exec(name) ?? [];
        if (/^[^\s,\0-\x1f\x7f]+$/.test(nick) && state.present.length < MAX) state.present.push({ nick, powers });
      }
    },
    "366": (state) => {
      const { flags, invites, present } = state;
      if (flags !== undefined) done(state, { flags, invites, present });
    },
    "403": (state) => {
      done(state, undefined);
    },
  };
  return {
    ask(write, room) {
      const known = asked.get(room);
      if (known !== undefined) return known.promise;
      let resolve: Asked["resolve"] = () => undefined;
      const promise = new Promise<RoomState | undefined>((settle) => {
        resolve = settle;
      });
      const timer = setTimeout(() => {
        const state = asked.get(room);
        if (state !== undefined) done(state, undefined);
      }, timeoutMs);
      asked.set(room, { flags: undefined, invites: [], present: [], room, promise, resolve, timer });
      write("MODE", [room]);
      // By SAMODE: Ergo lists the invites to a channel operator alone, which a bot back by SAJOIN is not.
      write("SAMODE", [room, "I"]);
      write("NAMES", [room]);
      return promise;
    },
    read({ command, params }) {
      // The room is the second word of each answer but NAMES's, which puts its kind before it.
      const room = command === "353" ? params[2] : params[1];
      const state = asked.get(room ?? "");
      if (state !== undefined) handlers[command]?.(state, params);
    },
    drop() {
      for (const state of asked.values()) done(state, undefined);
    },
  };
}
