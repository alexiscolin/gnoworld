// A room (slice 4's 4b): its name, its description (its IRC topic), its newest lines as the store holds them
// (the window), held at the newest while the reader is there, who is here, and the state of the link. A line's
// text is Markdown (4c), built into elements from an allowlist (Message.tsx).
// A line's author is its account tag alone, a nick being only a nick; a member's nick is an account's when it is
// an address, which a guest's cannot be (Ergo gives a guest 32 characters, server/src/testing/ergo.test.ts:314).
import type { Line } from "@gnoworld/core";
import { Address } from "@gnoworld/schemas";
import { Sidebar, Stack } from "@gnoworld/ui";
import { useLayoutEffect, useRef } from "react";
import type { ErgoState } from "../../lib/ergo/ergo.ts";
import { Message } from "./Message.tsx";
import { roomLabel, shortAddress } from "./names.ts";
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
// A line's look by its kind: a message plain, a notice and an /me apart.
const KINDS: Record<Line["kind"], string | undefined> = {
  message: undefined,
  notice: styles["notice"],
  action: styles["action"],
};
const LINES = [shared["plain"], shared["scrolls"], styles["lines"]].join(" ");
const CLOCK = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export interface RoomViewProps {
  room: string;
  state: { lines: readonly Line[]; members: readonly string[]; topic: string | undefined } | undefined;
  chat: ErgoState | "off";
}

// A person: a guest by its nick, said so; an account's address shortened, its whole in its title; another name
// whole (the moderation bot's).
function Person({ name, guest }: { name: string; guest: boolean }) {
  if (guest) return <span>{name} (guest)</span>;
  return Address.safeParse(name).success ? <span title={name}>{shortAddress(name)}</span> : <span>{name}</span>;
}

function LineView({ line }: { line: Line }) {
  return (
    <li className={KINDS[line.kind]}>
      <time dateTime={line.time} className={styles["time"]}>
        {CLOCK.format(new Date(line.time))}
      </time>{" "}
      {line.kind === "action" ? "* " : null}
      <Person name={line.account ?? line.from} guest={line.account === undefined} />{" "}
      {line.kind === "notice" ? <span className={styles["mark"]}>Notice </span> : null}
      <Message text={line.text} className={styles["text"]} />
    </li>
  );
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

// How near the end, in pixels, the reader still reads the newest line.
const AT_END = 32;

// The lines held at their newest while the reader is there; once scrolled up, left where the reader is.
function useNewestInView(lines: readonly Line[]) {
  const listRef = useRef<HTMLOListElement>(null);
  const atEndRef = useRef(true);
  useLayoutEffect(() => {
    if (listRef.current !== null && atEndRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [lines]);
  const onScroll = () => {
    const box = listRef.current;
    if (box !== null) atEndRef.current = box.scrollHeight - box.scrollTop - box.clientHeight < AT_END;
  };
  return { listRef, onScroll };
}

export function RoomView({ room, state, chat }: RoomViewProps) {
  const { lines = [], members = [], topic } = state ?? {};
  const { listRef, onScroll } = useNewestInView(lines);
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
          <ol
            ref={listRef}
            onScroll={onScroll}
            aria-label="Messages"
            aria-live="polite"
            aria-relevant="additions"
            className={LINES}
            tabIndex={0}
          >
            {lines.map((line) => (
              <LineView key={line.id} line={line} />
            ))}
          </ol>
          {connected && lines.length === 0 ? <p>No messages yet.</p> : null}
        </div>
        <People members={members} connected={connected} />
      </Sidebar>
    </Stack>
  );
}
