// The composer's reply bar (slice 4's 4d): over the field, the line the next one answers.
import { Cluster, IconButton } from "@gnoworld/ui";
import { Replying, type Answered } from "./Replying.tsx";
import styles from "./Composer.module.css";

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

export function ReplyBar({ id, to, me, members, onCancel }: ReplyBarProps) {
  return (
    <Cluster space="2xs">
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
    </Cluster>
  );
}
