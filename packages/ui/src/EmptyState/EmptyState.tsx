import type { ReactNode } from "react";
import { Button } from "../Button/Button.tsx";
import { Cluster, Stack } from "../compositions/index.ts";
import styles from "./EmptyState.module.css";

interface Way {
  /** The one way on; `reload` loads the document again, as an error page's way out does. */
  action?: { label: string; href: string; reload?: boolean };
}

interface Page extends Way {
  title: string;
  line: string;
  level?: 1 | 2 | 3;
  look?: "page";
}

// A list or a panel with nothing in it: a line in the muted grey, under a title of its own if it has one; no heading, none in the outline.
interface Inline extends Way {
  title?: string;
  line: ReactNode;
  look: "inline";
  level?: never;
}

// Where something could not be read or loaded: one line and the way to ask again. A polite status, never an alert: a load that failed leaves the
// page standing and asks nothing of a reader who is in the middle of something else; `urgent` makes it an alert, for a list the reader waits on.
interface Failed {
  urgent?: boolean;
  line: ReactNode;
  look: "failed";
  /** Asks again: the one way on. */
  onRetry?: () => void;
  title?: never;
  level?: never;
  action?: never;
}

export type EmptyStateProps = Page | Inline | Failed;

const HEADINGS = { 1: "h1", 2: "h2", 3: "h3" } as const;

/** What a list or a page shows when it has nothing: a title, a line, and the one way on, its primary; or, inline, a line. */
export function EmptyState(props: EmptyStateProps) {
  if (props.look === "failed")
    return (
      <Stack space="xs">
        <p role={props.urgent === true ? "alert" : "status"}>{props.line}</p>
        {props.onRetry === undefined ? null : <Button onClick={props.onRetry}>Try again</Button>}
      </Stack>
    );
  const { line, action } = props;
  const way =
    action === undefined ? null : (
      <Cluster>
        <Button href={action.href} reload={action.reload === true} emphasis="solid">
          {action.label}
        </Button>
      </Cluster>
    );
  if (props.look === "inline")
    return (
      <div className={styles["inline"]}>
        <Stack space="3xs">
          {props.title === undefined ? null : <p className={styles["title"]}>{props.title}</p>}
          <p>{line}</p>
        </Stack>
        {way}
      </div>
    );
  const Heading = HEADINGS[props.level ?? 2];
  return (
    <Stack space="s">
      <Heading>{props.title}</Heading>
      <p>{line}</p>
      {way}
    </Stack>
  );
}
