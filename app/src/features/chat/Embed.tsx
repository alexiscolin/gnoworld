// A link's player (slice 4's 4g; ADR-0002 §6): a card naming the player and saying its state, Play once the
// moderation's "checked"; the service's own frame on a click alone, so no third party is reached before. A hidden
// line's, none.
import type { StreamEvent } from "@gnoworld/schemas";
import { Button, Card, Cluster, Stack } from "@gnoworld/ui";
import { useEffect, useLayoutEffect, useRef, useState, type FocusEvent } from "react";
import type { Player } from "./embeds.ts";
import styles from "./Embed.module.css";

export interface EmbedProps {
  embed: Player;
  /** The line's verdict from the server's stream; none yet while it waits. */
  verdict: StreamEvent["state"] | undefined;
}

/** A service's player, framed; it takes the focus as it opens, on the reader's click, its whole frame in view (F895,
 * F899): the card it replaces held the focus, which would otherwise fall to the page. */
export function PlayerFrame({ embed }: { embed: Player }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    frameRef.current?.focus({ preventScroll: true });
    frameRef.current?.scrollIntoView({ block: "nearest" });
  }, []);
  return (
    <iframe
      ref={frameRef}
      src={embed.src}
      title={embed.title}
      className={styles["frame"]}
      allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
      allowFullScreen
      // No referrer, as the site sends none (F682; Alexis, 2026-10-26): YouTube's terms ask for one, so a player that
      // refuses to play brings the question back.
      referrerPolicy="no-referrer"
      // The player's own scripts, full screen and its links out, in an origin of its own: never this page's.
      sandbox="allow-scripts allow-presentation allow-popups"
    />
  );
}

/** How long a card waits on its line's verdict before saying it could not check it (F889). */
const CHECK_WAIT_MS = 15_000;

// Whether a verdict has been awaited past CHECK_WAIT_MS: the stream down and the server silent leave a line unchecked.
function useLate(waiting: boolean): boolean {
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => {
      setLate(true);
    }, CHECK_WAIT_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [waiting]);
  return late && waiting;
}

// The focus held in the player's box, card or frame: when a hide takes the box away, it goes back to its line, which
// the list's keys reach (4c: the list is no tab stop itself), not to the page (F896). Gone elsewhere, it is the reader's.
function useFocusKept(hidden: boolean) {
  const heldRef = useRef(false);
  const lineRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!hidden || !heldRef.current) return;
    heldRef.current = false;
    if (document.activeElement === document.body) lineRef.current?.focus();
  }, [hidden]);
  return {
    onFocus: (event: FocusEvent<HTMLDivElement>) => {
      heldRef.current = true;
      lineRef.current = event.currentTarget.closest("li");
    },
    onBlur: (event: FocusEvent<HTMLDivElement>) => {
      const to = event.relatedTarget;
      if (to !== null && !event.currentTarget.contains(to)) heldRef.current = false;
    },
  };
}

export function Embed({ embed, verdict }: EmbedProps) {
  const [playing, setPlaying] = useState(false);
  const late = useLate(verdict === undefined);
  const kept = useFocusKept(verdict === "hidden");
  // The card's own box, and whether its Play takes the focus back as the player closes.
  const cardRef = useRef<HTMLDivElement>(null);
  const backRef = useRef(false);
  useEffect(() => {
    if (playing || !backRef.current) return;
    backRef.current = false;
    cardRef.current?.querySelector("button")?.focus();
  }, [playing]);
  // The player runs on a checked link alone: a verdict that leaves "checked" (a correction awaiting its check) closes it,
  // and a later "checked" waits for a click again (CR1 of the room edit).
  if (playing && verdict !== "checked") setPlaying(false);
  if (verdict === "hidden") return null;
  if (playing) {
    // A player stops on its reader's word: an animation loops for good, a video plays on (WCAG 2.2.2, F1053).
    return (
      <div {...kept}>
        <Stack space="2xs">
          <PlayerFrame embed={embed} />
          <Cluster>
            <Button
              emphasis="quiet"
              icon="close"
              onClick={() => {
                backRef.current = true;
                setPlaying(false);
              }}
            >
              Close the player
            </Button>
          </Cluster>
        </Stack>
      </div>
    );
  }
  const checked = verdict === "checked";
  // Its state in words, which a reader hears as it changes; Play alone once checked (F897).
  const word = checked ? "Ready to play" : late ? "Couldn't check this link" : "Waiting for the moderation check…";
  return (
    <div ref={cardRef} {...kept}>
      <Card compact>
        <Card.Header icon="play" title={embed.title} />
        <p role="status" className={styles["status"]}>
          {word}
        </p>
        {checked ? (
          <Card.Actions>
            <Button
              onClick={() => {
                setPlaying(true);
              }}
            >
              {`Play the ${embed.title}`}
            </Button>
          </Card.Actions>
        ) : null}
      </Card>
    </div>
  );
}
