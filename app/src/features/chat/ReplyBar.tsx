// The composer's reply bar (slice 4's 4d): over the field, the line the next one answers.
import { IconButton, Sidebar } from "@gnoworld/ui";
import { useId, useLayoutEffect, type KeyboardEvent, type RefObject } from "react";
import { Replying, type Answered } from "./Replying.tsx";
import styles from "./RoomView.module.css";

// The graphemes the reply bar shows of the line answered (docs/decisions.md, 2026-10-26).
const SHOWN = 60;

// Over the field, the line the next one answers, and a way to answer none, which hands the focus to the field as the
// bar and its button go, never to the page (the code review's CR4).
interface ReplyBarProps {
  /** The bar's words' id, which describes the field (the code review's CR7). */
  id: string;
  to: Answered;
  /** The reader and the room's members, whose mentions in the words are shortened. */
  me: string;
  members: ReadonlySet<string>;
  onCancel: (() => void) | undefined;
}

function ReplyBar({ id, to, me, members, onCancel }: ReplyBarProps) {
  return (
    <Sidebar side="end" space="2xs">
      <p id={id} className={styles["replying"]}>
        <Replying to={to} length={SHOWN} known={(address) => address === me || members.has(address)} />
      </p>
      <IconButton
        icon="close"
        label="Cancel the reply"
        size="s"
        emphasis="plain"
        onClick={(event) => {
          const form = event.currentTarget.closest("form");
          onCancel?.();
          form?.querySelector("input")?.focus();
        }}
      />
    </Sidebar>
  );
}

// A line chosen to answer, each time Reply is asked, the same line's again included: the field takes the focus; an
// edit of that line's words changes what the bar quotes, never where the focus is (the code review's CR2).
function useFocusOnReply(answers: boolean, asked: number, formRef: RefObject<HTMLFormElement | null>) {
  const answering = answers ? asked : undefined;
  useLayoutEffect(() => {
    if (answering !== undefined) formRef.current?.querySelector("input")?.focus();
  }, [answering, formRef]);
}

/** The composer's form, its box, and what it does with a key the reply does not take. */
interface Form {
  formRef: RefObject<HTMLFormElement | null>;
  box: () => Element | undefined;
  otherwise: (event: KeyboardEvent<HTMLFormElement>) => void;
}

/** What the composer is told of the line the next one answers (4d's replies), and who writes and where. */
interface AnsweringProps {
  nick: string;
  members: readonly string[];
  replying?: Answered | undefined;
  asked?: number | undefined;
  onCancelReply?: (() => void) | undefined;
}

// The line the next one answers (4d's replies): the bar over the field, which the field is described by; the focus
// Reply puts in the field; and Escape in the box, which answers none as the bar's cancel does, the draft staying (U3).
export function useAnswering(props: AnsweringProps, { formRef, box, otherwise }: Form) {
  const { replying, asked = 0, onCancelReply, nick, members } = props;
  const id = useId();
  useFocusOnReply(replying !== undefined, asked, formRef);
  return {
    bar:
      replying === undefined ? null : (
        <ReplyBar id={id} to={replying} me={nick} members={new Set(members)} onCancel={onCancelReply} />
      ),
    describedBy: replying === undefined ? undefined : id,
    // A key of the form: Escape in the box, answering none, else what the form does with it.
    keys: (event: KeyboardEvent<HTMLFormElement>) => {
      if (event.key === "Escape" && replying !== undefined && event.target === box()) onCancelReply?.();
      else otherwise(event);
    },
  };
}
