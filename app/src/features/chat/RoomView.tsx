// A room (slice 4's 4b): its name, its description (its IRC topic), its newest lines as the store holds them
// (the window), held at the newest while the reader is there, who is here, and the state of the link. A line's
// text is Markdown (4c), built into elements from an allowlist (Message.tsx); one that mentions the reader says so
// (4d); the composer, given, goes below.
// A line's author is its account tag alone, a nick being only a nick; a member's nick is an account's when it is
// an address, which a guest's cannot be (Ergo gives a guest 32 characters, server/src/testing/ergo.test.ts:314).
import { typingAt, type Line, type Reacting, type Reaction, type Typing } from "@gnoworld/core";
import type { StreamEvent } from "@gnoworld/schemas";
import { Button, Cluster, Sidebar, Stack } from "@gnoworld/ui";
import { Fragment, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import type { ErgoState } from "../../lib/ergo/ergo.ts";
import type { LinesProps } from "./Lines.tsx";
import { isAccount, shortAddress } from "./names.ts";
import { Person } from "./Person.tsx";
import { RoomMain } from "./RoomMain.tsx";
import shared from "./lists.module.css";
import styles from "./RoomView.module.css";

// The lines view (the lines, what is under them, a line's bar) is asked once the room holds a line: lines come over the
// WebSocket after the page is drawn, so its code is never the first screen's (ADR-0001 §12; docs/decisions.md,
// 2026-10-26). One boundary for every feature of a line.
const Lines = lazy(async () => ({ default: (await import("./Lines.tsx")).Lines }));
const LINES = [shared["plain"], shared["scrolls"], styles["lines"]].join(" ");
// The list's place while its code comes, or while the room holds no line: no line, no tab stop; a key pressed meanwhile
// acts on the page as it stands, nothing queued for the lines.
const waiting = (busy: boolean) => <ol aria-label="Messages" aria-busy={busy || undefined} className={LINES} />;

// The room's lines: the list's place while it holds none or their code comes, then the lines view.
function RoomLines(props: LinesProps) {
  return props.lines.length === 0 ? (
    waiting(false)
  ) : (
    <Suspense fallback={waiting(true)}>
      <Lines {...props} />
    </Suspense>
  );
}

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
  /** The room whose lines are in view: its lines have bars (4c); none for a direct message's (4e). */
  room?: string | undefined;
  /** Its name: a room's label; a direct message's partner (4e). */
  title: ReactNode;
  /** What it says of itself under its name: a room's description, its IRC topic; a conversation's "not encrypted". */
  note?: ReactNode;
  /** The note's id, which the composer points at (4e's U6). */
  noteId?: string | undefined;
  state:
    | {
        lines: readonly Line[];
        members: readonly string[];
        /** The msgid of a line Ergo refused to delete (4c). */
        refused?: string | undefined;
        /** Who is typing, each nick with the time its typing ends (4f). */
        typing?: Typing;
        /** The time of the last line the account read here, Ergo's (4f). */
        read?: string | undefined;
        /** This connection's history page came (4f's G1, CR3). */
        paged?: true | undefined;
        /** Its reactions (4d). */
        reactions?: readonly Reaction[] | undefined;
        /** Ergo refused one of the page's reactions here (4d). */
        cannotReact?: true | undefined;
      }
    | undefined;
  chat: ErgoState | "off";
  /** What goes under the lines: the composer for an account, a word for a guest. */
  composer?: ReactNode;
  /** The reader's address, the lines that mention it marked; none for a guest. */
  me?: string | undefined;
  /** Deletes a line, the reader's own (4c's message menu); whether it went out. */
  onDelete: (id: string) => boolean;
  /** The room's flash said Ergo's refusal of a delete. */
  onDismiss: () => void;
  /** The room read to its newest line, as the reader reaches it (4f). */
  onRead?: ((id: string) => void) | undefined;
  /** What it says while it holds no line, once connected: a conversation's own words (4e). */
  empty?: string | undefined;
  /** Beside the lines: a room's who is here; a conversation, of two, has none (4e). */
  aside?: ReactNode;
  /** The room's lines' verdicts, by msgid, from the server's stream (4g). */
  verdicts?: Readonly<Record<string, StreamEvent["state"]>> | undefined;
  /** Whether the reader saves data (ADR-0002 §8): then no player is offered, nor any verdict asked (4g, F893). */
  saving?: boolean;
  /** Reacts to a line, or takes the reaction back (4d's reactions); whether it went out. */
  onReact?: ((reaction: Reacting) => boolean) | undefined;
  /** Makes a line, by its msgid, the one the composer's next answers (4d's replies). */
  onReply?: ((id: string) => void) | undefined;
  /** Opens a line's thread, by the msgid of its root (4d's threads); none for a direct message's lines. */
  onThread?: ((id: string) => void) | undefined;
  /** A thread is open in `aside`: a narrow room gives it the whole width (RoomView.module.css). */
  threaded?: boolean | undefined;
}

/** Who is here: counted once connected, the bot left out, the first MEMBERS_SHOWN named. */
export interface PeopleProps {
  members: readonly string[];
  connected: boolean;
  /** The reader's address, and how it opens a direct message with another account: each offered beside it. */
  me: string | undefined;
  onMessage: ((partner: string) => void) | undefined;
}

export function People({ members, connected, me, onMessage }: PeopleProps) {
  const people = members.filter((nick) => nick !== BOT);
  return (
    <aside aria-label="Who's here">
      <h3 className={styles["count"]}>{connected ? `${String(people.length)} here` : "Who's here"}</h3>
      <ul className={shared["plain"]}>
        {people.slice(0, MEMBERS_SHOWN).map((nick) => {
          const account = isAccount(nick);
          return (
            <li key={nick}>
              {/* The name at the start, its Message at the end: one column whatever the name's width (U18). */}
              <Cluster space="3xs" justify="between">
                <Person name={nick} guest={!account} account={account} />
                {onMessage !== undefined && account && me !== undefined && nick !== me ? (
                  // A visible word, not an icon alone (decision D); the address for a screen reader's list.
                  <Button
                    icon="chat"
                    size="s"
                    emphasis="quiet"
                    onClick={() => {
                      onMessage(nick);
                    }}
                  >
                    Message<span className="visually-hidden"> {shortAddress(nick)}</span>
                  </Button>
                ) : null}
              </Cluster>
            </li>
          );
        })}
      </ul>
      {people.length > MEMBERS_SHOWN ? <p>and {String(people.length - MEMBERS_SHOWN)} more</p> : null}
    </aside>
  );
}

// Who is typing, by name, on the page's clock (its own a room: CR4), drawn again as the next one's time ends, a timer
// firing early never seen as before it (CR6); under the lines and out of every live region, so a screen reader hears
// the lines and not each pause of another's.
function Typists({ typing }: { typing: Typing }) {
  const [now, setNow] = useState(() => Date.now());
  const next = Math.min(...Object.values(typing ?? {}).filter((until) => until > now));
  useEffect(() => {
    if (next === Infinity) return;
    const timer = setTimeout(() => {
      setNow(Math.max(Date.now(), next));
    }, next - Date.now());
    return () => {
      clearTimeout(timer);
    };
  }, [next]);
  const nicks = typingAt(typing, now);
  const verb = nicks.length === 1 ? "is" : "are";
  // Up to three by name, which a wide screen holds; the line is cut to one (U2), its whole in its title: the names in
  // full, a guest said so.
  const named = nicks.map((nick, at) => (
    <Fragment key={nick}>
      {at === 0 ? "" : at === nicks.length - 1 ? " and " : ", "}
      <Person name={nick} guest={!isAccount(nick)} />
    </Fragment>
  ));
  const whole = nicks.map((nick) => (isAccount(nick) ? nick : `${nick} (guest)`));
  const title = `${whole.length > 1 ? `${whole.slice(0, -1).join(", ")} and ` : ""}${whole.at(-1) ?? ""} ${verb} typing`;
  return (
    <p className={styles["typing"]} title={nicks.length === 0 ? undefined : title}>
      {nicks.length === 0 ? null : nicks.length > 3 ? (
        "Several people are typing"
      ) : (
        <>
          {named} {verb} typing
        </>
      )}
    </p>
  );
}

// A room's name and its description, its IRC topic; a conversation's partner and what it says of itself (4e).
function Header({ title, topic, id }: { title: ReactNode; topic: ReactNode; id: string | undefined }) {
  return (
    <header>
      <h2>{title}</h2>
      {topic === undefined ? null : (
        <p id={id} className={styles["topic"]}>
          {topic}
        </p>
      )}
    </header>
  );
}

export function RoomView(props: RoomViewProps) {
  const { room, title, note, noteId, state, chat, composer, me, onDelete, onDismiss, onRead, aside } = props;
  const { onReact, onReply, onThread, threaded } = props;
  const { verdicts, saving = false } = props;
  const { empty = "No messages yet." } = props;
  const { lines = [], members = [], refused, typing, read, paged, reactions, cannotReact } = state ?? {};
  const connected = chat === "connected";
  return (
    <Stack as="section" space="s">
      <Header title={title} topic={note} id={noteId} />
      <p role="status" className={styles["status"]}>
        {connected ? null : NOTICES[chat]}
      </p>
      <div className={styles["room"]}>
        <Sidebar side="end" space="m">
          <RoomMain threaded={threaded}>
            <RoomLines
              key={room}
              room={room}
              lines={lines}
              members={members}
              me={me}
              refused={refused}
              connected={connected}
              onDelete={onDelete}
              onDismiss={onDismiss}
              read={read}
              paged={paged === true}
              onRead={onRead}
              verdicts={verdicts}
              saving={saving}
              reactions={reactions}
              onReact={onReact}
              cannotReact={cannotReact}
              onReply={onReply}
              onThread={onThread}
            />
            {connected && lines.length === 0 ? <p>{empty}</p> : null}
            {/* A room's, whose place is kept so the composer never moves; a direct message tells none (4e). */}
            {room === undefined ? null : <Typists key={`${room} typing`} typing={typing} />}
            {composer}
          </RoomMain>
          {aside}
        </Sidebar>
      </div>
    </Stack>
  );
}
