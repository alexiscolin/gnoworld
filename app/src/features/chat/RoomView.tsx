// A room (slice 4's 4b): its name, its description (its IRC topic), its newest lines as the store holds them
// (the window), held at the newest while the reader is there, who is here, and the state of the link. A line's
// text is Markdown (4c), built into elements from an allowlist (Message.tsx); one that mentions the reader says so
// (4d); the composer, given, goes below.
// A line's author is its account tag alone, a nick being only a nick; a member's nick is an account's when it is
// an address, which a guest's cannot be (Ergo gives a guest 32 characters, server/src/testing/ergo.test.ts:314).
import { markdown, mentions, type Block, type Line } from "@gnoworld/core";
import { Address } from "@gnoworld/schemas";
import { IconButton, Sidebar, Stack } from "@gnoworld/ui";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import type { ErgoState } from "../../lib/ergo/ergo.ts";
import { Markdown } from "./Message.tsx";
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
  /** What goes under the lines: the composer for an account, a word for a guest. */
  composer?: ReactNode;
  /** The reader's address, the lines that mention it marked; none for a guest. */
  me?: string | undefined;
  /** The page's name for it in place of the room's: a direct message's partner (4e). */
  label?: string | undefined;
  /** Opens a direct message with another account here, offered to an account (4e). */
  onMessage?: ((partner: string) => void) | undefined;
}

// A person: a guest by its nick, said so; an account's address shortened, its whole in its title; another name
// whole (the moderation bot's).
function Person({ name, guest }: { name: string; guest: boolean }) {
  if (guest) return <span>{name} (guest)</span>;
  return Address.safeParse(name).success ? <span title={name}>{shortAddress(name)}</span> : <span>{name}</span>;
}

// A line's mentions, space-separated, read apart from its drawing so the compiler keeps the drawing's tree out of
// what a change of members recomputes.
const namesOf = (text: string): string => mentions(markdown(text)).join(" ");

// The addresses of `names` (a line's mentions, space-separated) that are members, as one string.
const knownOf = (names: string, members: ReadonlySet<string>): string =>
  names
    .split(" ")
    .filter((address) => members.has(address))
    .join(" ");

// A line's text drawn, its mentions of `known` (space-separated) shortened. A component of its own, with a string the
// compiler compares by value: the line keeps its drawing while others join and leave (F812's cost).
function LineText({ blocks, me, known }: { blocks: readonly Block[]; me: string | undefined; known: string }) {
  return <Markdown blocks={blocks} className={styles["text"]} me={me} members={new Set(known.split(" "))} />;
}

// A line, read once: drawn, and asked whether it mentions the reader, which a word says as well as its colour; a
// mention shortened for the reader and the room's members alone (F812). A change of members reads its mentions
// again, never its drawing.
function LineView({ line, me, members }: { line: Line; me: string | undefined; members: ReadonlySet<string> }) {
  const blocks = markdown(line.text);
  const names = namesOf(line.text);
  const mentioned = names.split(" ").some((address) => address === me);
  const known = knownOf(names, members);
  return (
    <li className={KINDS[line.kind]} data-about-me={mentioned ? "" : undefined}>
      {/* The line's marks first, before the time: where no sender's words stand (F808). */}
      {mentioned ? <span className={styles["mentionsYou"]}>Mentions you </span> : null}
      {line.kind === "notice" ? <span className={styles["mark"]}>Notice </span> : null}
      <time dateTime={line.time} className={styles["time"]}>
        {CLOCK.format(new Date(line.time))}
      </time>{" "}
      {line.kind === "action" ? "* " : null}
      <Person name={line.account ?? line.from} guest={line.account === undefined} />{" "}
      <LineText blocks={blocks} me={me} known={known} />
    </li>
  );
}

// Who is here: counted once connected, the bot left out, the first MEMBERS_SHOWN named.
interface PeopleProps {
  members: readonly string[];
  connected: boolean;
  /** The reader's address, and how it opens a direct message with another account: each offered beside it. */
  me: string | undefined;
  onMessage: ((partner: string) => void) | undefined;
}

function People({ members, connected, me, onMessage }: PeopleProps) {
  const people = members.filter((nick) => nick !== BOT);
  const writes = (nick: string) =>
    me !== undefined && onMessage !== undefined && nick !== me && Address.safeParse(nick).success;
  return (
    <aside aria-label="Who's here">
      <h3 className={styles["count"]}>{connected ? `${String(people.length)} here` : "Who's here"}</h3>
      <ul className={shared["plain"]}>
        {people.slice(0, MEMBERS_SHOWN).map((nick) => (
          <li key={nick}>
            <Person name={nick} guest={!Address.safeParse(nick).success} />
            {writes(nick) ? (
              <>
                {" "}
                <IconButton
                  icon="chat"
                  size="s"
                  emphasis="plain"
                  label={`Write to ${shortAddress(nick)}`}
                  onClick={() => {
                    onMessage?.(nick);
                  }}
                />
              </>
            ) : null}
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

// A room's name and its description, its IRC topic; a conversation's partner and what it says of itself (4e).
function Header({ title, topic }: { title: string; topic: string | undefined }) {
  return (
    <header>
      <h2>{title}</h2>
      {topic === undefined ? null : <p className={styles["topic"]}>{topic}</p>}
    </header>
  );
}

export function RoomView({ room, state, chat, composer, me, label, onMessage }: RoomViewProps) {
  const { lines = [], members = [], topic } = state ?? {};
  const { listRef, onScroll } = useNewestInView(lines);
  const connected = chat === "connected";
  // Who a mention may shorten (F812): the members, and the authors in view by their account tag, who proved their
  // key as a member did (F819).
  const known = new Set([...members, ...lines.flatMap(({ account }) => (account === undefined ? [] : [account]))]);
  return (
    <Stack as="section" space="s">
      <Header title={label ?? roomLabel(room)} topic={topic} />
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
              <LineView key={line.id} line={line} me={me} members={known} />
            ))}
          </ol>
          {connected && lines.length === 0 ? <p>No messages yet.</p> : null}
          {composer}
        </div>
        <People members={members} connected={connected} me={me} onMessage={onMessage} />
      </Sidebar>
    </Stack>
  );
}
