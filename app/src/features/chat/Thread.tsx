// A thread's panel (slice 4's 4d threads; docs/plans/chat-features.md, M3): one thread's root and its replies beside
// the room, drawn from the room's own lines, so none is fetched: a root the window no longer holds is "an earlier
// message", its replies kept. The room's lines are read as the room shows them, an author's edit folded into its line.
// Its rows are the room's, with no bar, no chip, no quote and no player: a stranger's words open to abuse draw no
// third party here, whatever the moderation's verdict (4g draws the players, in the room's list).
// Its composer, given, tags every line with the root's msgid; a guest gets a word in its place.
import { excerpt, foldEdits, threadsOf, type Line } from "@gnoworld/core";
import { IconButton, Sidebar, Stack } from "@gnoworld/ui";
import { useEffect, useEffectEvent, useRef, type KeyboardEvent, type ReactNode } from "react";
import { LineView } from "./LineView.tsx";
import shared from "./lists.module.css";
import { mentionable } from "./names.ts";
import { shortened } from "./shortened.ts";
import room from "./RoomView.module.css";
import styles from "./Thread.module.css";

/** The graphemes of a root's words the title keeps. */
export const TITLE_LENGTH = 60;

const LINES = [shared["plain"], shared["scrolls"], room["lines"]].join(" ");

export interface ThreadProps {
  /** The msgid of the thread's root: a line of the room's lines, or a line the window no longer holds. */
  root: string;
  /** The room's lines. */
  lines: readonly Line[];
  members: readonly string[];
  /** The reader's address; none for a guest, whose focus starts on Close. */
  me: string | undefined;
  /** Closes the panel. */
  onClose: () => void;
  /** Under the thread's lines: the account's composer, tagging each line with the root's msgid; a guest's word. */
  composer: ReactNode;
}

const countOf = (replies: number) =>
  replies === 0 ? "No replies yet" : replies === 1 ? "1 reply" : `${String(replies)} replies`;

export function Thread({ root, lines, members, me, onClose, composer }: ThreadProps) {
  const { shown, folded } = foldEdits(lines);
  const resolve = (id: string) => folded.get(id) ?? id;
  const id = resolve(root);
  const replies = threadsOf(shown, resolve).repliesOf.get(id) ?? [];
  const head = shown.find((line) => line.id === id);
  const rows = head === undefined ? replies : [head, ...replies];
  const known = mentionable(members, shown);
  const title =
    head === undefined
      ? "an earlier message"
      : excerpt(
          shortened(head.text, (address) => address === me || known.has(address)),
          TITLE_LENGTH,
        );
  const boxRef = useRef<HTMLElement>(null);
  // A guest has no field: the focus goes to Close as the panel opens, which an account's composer leaves to the field;
  // a session that changes later moves it nowhere.
  const start = useEffectEvent(() => {
    if (me === undefined) boxRef.current?.querySelector("button")?.focus();
  });
  useEffect(() => {
    start();
  }, []);
  // An Escape that ends an input method's composition belongs to the composition: Safari marks it with keyCode 229, not
  // isComposing (R5). The legacy keyCode is the one signal there is: read by name, as the types mark it deprecated.
  const escape = (event: KeyboardEvent) => {
    const { nativeEvent } = event;
    if (
      event.key !== "Escape" ||
      event.defaultPrevented ||
      nativeEvent.isComposing ||
      Reflect.get(nativeEvent, "keyCode") === 229
    )
      return;
    event.preventDefault();
    onClose();
  };
  return (
    <aside ref={boxRef} aria-label="Thread" className={styles["panel"]} onKeyDown={escape}>
      <Stack space="s">
        <Sidebar side="end" space="2xs">
          <h3 className={styles["title"]}>{title === "" ? "Thread" : `Thread: ${title}`}</h3>
          <IconButton icon="close" label="Close the thread" size="s" emphasis="plain" onClick={onClose} />
        </Sidebar>
        <p className={styles["count"]}>{countOf(replies.length)}</p>
        <ol aria-label="In this thread" className={LINES}>
          {rows.map((line) => (
            <LineView
              key={line.id}
              line={line}
              me={me}
              members={known}
              stop={false}
              actions={null}
              fresh={false}
              verdict={undefined}
              players={false}
              saved={false}
              pinned={false}
              chips={undefined}
              react={undefined}
              answers={undefined}
              inThread
            />
          ))}
        </ol>
        {composer}
      </Stack>
    </aside>
  );
}
