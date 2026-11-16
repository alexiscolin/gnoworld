import { Button, Cluster, EmptyState, Stack } from "@gnoworld/ui";
import { SEARCH_HASH } from "../../lib/searchHash.ts";
import type { ErrorKind } from "./kind.ts";
import { WORDS, type Way } from "./words.ts";
import styles from "./ErrorView.module.css";

interface Where {
  here: string;
  earth: string;
  galaxy: string;
}

interface Shared {
  kind: ErrorKind;
  /** The place a route gives: a world, a realm, a universe. */
  noun?: string | undefined;
  /** Inline's own way to ask again, where the card can do it without a reload. */
  onRetry?: (() => void) | undefined;
  /** A reference the visitor can quote, or the message and stack in development. */
  note?: string | undefined;
  detail?: string | undefined;
}

// The page, inside the shell, or the place, inside a plate, lead on to where the ways go: the page itself, the Earth, the Galaxy. Inline,
// a line in a card or a panel, leads nowhere, so a place with no route to read (a chunk that failed, drawn at the module's start) needs none.
export type ErrorViewProps = Shared &
  (
    | { size?: "page" | "place"; where: Where; urgent?: never }
    | {
        size: "inline";
        where?: Where | undefined;
        /** An alert, for a list the reader waits on; a polite status otherwise. */
        urgent?: boolean | undefined;
      }
  );

interface Link {
  label: string;
  href: string;
  reload: boolean;
}

function ways(kind: ErrorKind, where: Where): { first: Link; rest: Link[] } {
  // The app may be what failed: a way out of a crash loads the document again, which the router cannot.
  const reload = kind !== "not-found";
  const all: Record<Way, Link> = {
    again: { label: "Try again", href: where.here, reload: true },
    reload: { label: "Reload", href: where.here, reload: true },
    search: { label: "Search", href: `${where.galaxy}${SEARCH_HASH}`, reload },
    earth: { label: "Go to the Earth", href: where.earth, reload },
  };
  const first = all[WORDS[kind].way];
  const rest = [
    { label: "Earth", href: where.earth, reload },
    { label: "Galaxy", href: where.galaxy, reload },
  ].filter((link) => link.label !== first.label.replace("Go to the ", ""));
  return { first, rest };
}

const reload = () => {
  location.reload();
};

/** What a failure shows, in three sizes: its title, one line, a primary way on and the places to go. */
export function ErrorView(props: ErrorViewProps) {
  const { kind, noun, onRetry, note, detail } = props;
  const words = WORDS[kind];
  if (props.size === "inline")
    return <EmptyState look="failed" line={words.short} urgent={props.urgent === true} onRetry={onRetry ?? reload} />;
  const size = props.size ?? "page";
  const { first, rest } = ways(kind, props.where);
  return (
    <div role="alert">
      <div className={styles["view"]} data-size={size} data-kind={kind}>
        <Stack space="s">
          <h1>{words.title(noun)}</h1>
          <p className={styles["line"]}>{words.line(noun ?? "page")}</p>
          <Cluster>
            <Button href={first.href} reload={first.reload} emphasis="solid">
              {first.label}
            </Button>
            {rest.map((link) => (
              <Button key={link.label} href={link.href} reload={link.reload} emphasis="outline">
                {link.label}
              </Button>
            ))}
          </Cluster>
          {note === undefined ? null : <p className={styles["note"]}>{note}</p>}
          {detail === undefined ? null : (
            <details className={styles["note"]}>
              <summary>Details</summary>
              <pre>{detail}</pre>
            </details>
          )}
        </Stack>
      </div>
    </div>
  );
}
