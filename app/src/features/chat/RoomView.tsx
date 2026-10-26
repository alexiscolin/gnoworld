// A room (slice 4's 4b): its name, its description (its IRC topic), its newest lines as the store holds them
// (the window), held at the newest while the reader is there, who is here, and the state of the link. A line's
// text is Markdown (4c), built into elements from an allowlist (Message.tsx); one that mentions the reader says so
// (4d); the composer, given, goes below.
// A line's author is its account tag alone, a nick being only a nick; a member's nick is an account's when it is
// an address, which a guest's cannot be (Ergo gives a guest 32 characters, server/src/testing/ergo.test.ts:314).
import type { Line } from "@gnoworld/core";
import { Address } from "@gnoworld/schemas";
import { Sidebar, Stack } from "@gnoworld/ui";
import type { ReactNode } from "react";
import type { ErgoState } from "../../lib/ergo/ergo.ts";
import { Lines } from "./Lines.tsx";
import { roomLabel } from "./names.ts";
import { Person } from "./Person.tsx";
import shared from "./lists.module.css";
import styles from "./RoomView.module.css";

/** The people a room lists by name; the others are counted. */
export const MEMBERS_SHOWN = 100;
// The server's moderation bot (server/src/irc/lines.ts), in every room, never listed.
const BOT = "gnoworld";
const NOTICES: Record<Exclude<ErgoState | "off", "connected">, string> = {
  off: "Connecting to the chat…",
  connecting: "Connecting to the chat…",
  "logged-out": "Connecting to the chat…",
  waiting: "The chat is out of reach. Trying again…",
  stopped: "The chat is off.",
};

export interface RoomViewProps {
  room: string;
  state:
    | {
        lines: readonly Line[];
        members: readonly string[];
        topic: string | undefined;
        /** The msgid of a line Ergo refused to delete (4c). */
        refused?: string | undefined;
      }
    | undefined;
  chat: ErgoState | "off";
  /** What goes under the lines: the composer for an account, a word for a guest. */
  composer?: ReactNode;
  /** The reader's address, the lines that mention it marked; none for a guest. */
  me?: string | undefined;
  /** Deletes a line, the reader's own (4c's message menu); whether it went out. */
  onDelete?: ((id: string) => boolean) | undefined;
  /** The room's flash said Ergo's refusal of a delete. */
  onDismiss?: (() => void) | undefined;
}

// Who is here: counted once connected, the bot left out, the first MEMBERS_SHOWN named.
function People({ members, connected }: { members: readonly string[]; connected: boolean }) {
  const people = members.filter((nick) => nick !== BOT);
  return (
    <aside aria-label="Who's here">
      <h3 className={styles["count"]}>{connected ? `${String(people.length)} here` : "Who's here"}</h3>
      <ul className={shared["plain"]}>
        {people.slice(0, MEMBERS_SHOWN).map((nick) => (
          <li key={nick}>
            <Person name={nick} guest={!Address.safeParse(nick).success} />
          </li>
        ))}
      </ul>
      {people.length > MEMBERS_SHOWN ? <p>and {String(people.length - MEMBERS_SHOWN)} more</p> : null}
    </aside>
  );
}

export function RoomView({ room, state, chat, composer, me, onDelete, onDismiss }: RoomViewProps) {
  const { lines = [], members = [], topic, refused } = state ?? {};
  const connected = chat === "connected";
  return (
    <Stack as="section" space="s">
      <header>
        <h2>{roomLabel(room)}</h2>
        {topic === undefined ? null : <p className={styles["topic"]}>{topic}</p>}
      </header>
      <p role="status" className={styles["status"]}>
        {connected ? null : NOTICES[chat]}
      </p>
      <Sidebar side="end" space="m">
        <div>
          <Lines
            key={room}
            room={room}
            lines={lines}
            members={members}
            me={me}
            refused={refused}
            onDelete={onDelete ?? (() => false)}
            onDismiss={onDismiss ?? (() => undefined)}
          />
          {connected && lines.length === 0 ? <p>No messages yet.</p> : null}
          {composer}
        </div>
        <People members={members} connected={connected} />
      </Sidebar>
    </Stack>
  );
}
