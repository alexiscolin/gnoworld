import { Button, Cluster, EmptyState, Stack } from "@gnoworld/ui";
import { SEARCH_HASH } from "../../lib/searchHash.ts";
import type { ErrorKind } from "./kind.ts";
import { WORDS, type Way } from "./words.ts";
import styles from "./ErrorView.module.css";

export interface ErrorViewProps {
  kind: ErrorKind;
  /** The place a route gives: a world, a realm, a universe. */
  noun?: string | undefined;
  /** The page, inside the shell; the place, inside a plate; inline, a line in a card or a panel. */
  size?: "page" | "place" | "inline";
  /** Where the ways lead: the page itself, the Earth, the Galaxy. */
  where: { here: string; earth: string; galaxy: string };
  /** Inline's own way to ask again, where the card can do it without a reload. */
  onRetry?: (() => void) | undefined;
  /** A reference the visitor can quote, or the message and stack in development. */
  note?: string | undefined;
  detail?: string | undefined;
}

interface Link {
  label: string;
  href: string;
  reload: boolean;
}

function ways(kind: ErrorKind, where: ErrorViewProps["where"]): { first: Link; rest: Link[] } {
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
export function ErrorView({ kind, noun, size = "page", where, onRetry, note, detail }: ErrorViewProps) {
  const words = WORDS[kind];
  if (size === "inline") return <EmptyState look="failed" line={words.short} onRetry={onRetry ?? reload} />;
  const { first, rest } = ways(kind, where);
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
