// Opening a room at a found message (slice 13, C): CHATHISTORY AROUND, which Ergo v2.19.1 serves (irc/handlers.go:935; the server's
// irc/fetch.ts uses it). A hit's msgid comes from the server's index, never from Ergo, so it is checked again before it goes into a command.
import type { IrcMessage } from "@gnoworld/core";
import { RoomId } from "@gnoworld/schemas";
import { isCommandMsgid } from "../history.ts";
import { shortDay } from "../../../lib/days.ts";

/** The items asked around the message: half before it, then on from there (Ergo's AROUND); under the window the store keeps. */
export const AROUND_LINES = 100;

/** The command that asks the window around a message, or none for a room or a msgid no command may carry. */
export function aroundCommand(room: string, msgid: string): string | undefined {
  if (!RoomId.safeParse(room).success || !isCommandMsgid(msgid)) return undefined;
  return `CHATHISTORY AROUND ${room} msgid=${msgid} ${String(AROUND_LINES)}`;
}

/** The one jump waiting for Ergo's answer: its page is the first of the room's that holds the message. */
export class Jumps {
  #waiting: { room: string; msgid: string } | undefined;

  /** The command to send for a new jump, which forgets the last; none (and nothing awaited) for a refused one. */
  ask(room: string, msgid: string): string | undefined {
    const command = aroundCommand(room, msgid);
    this.#waiting = command === undefined ? undefined : { room, msgid };
    return command;
  }

  /** The msgid asked, when this page of `room` holds it: the jump is then done. */
  answer(room: string, messages: readonly IrcMessage[]): string | undefined {
    const waiting = this.#waiting;
    if (waiting?.room !== room || !messages.some(({ tags }) => tags.get("msgid") === waiting.msgid)) return undefined;
    this.#waiting = undefined;
    return waiting.msgid;
  }

  cancel(): void {
    this.#waiting = undefined;
  }
}

/** What the room says over its lines while it is read around a found message: the day, with the year when it is not this year's. */
export function readingWords(time: string, now: Date, reader: { timeZone?: string } = {}): string {
  const at = new Date(time);
  if (Number.isNaN(at.getTime())) return "You are reading around a found message.";
  return `You are reading ${shortDay(at, now, reader)}, around a found message.`;
}
