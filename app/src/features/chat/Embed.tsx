// A link's player (slice 4's 4g; ADR-0002 §6): a card naming the service, its button waiting on the moderation's
// "checked"; the service's own frame on a click alone, so no third party is reached before. A hidden line's, none.
import type { StreamEvent } from "@gnoworld/schemas";
import { Button, Cluster } from "@gnoworld/ui";
import { useEffect, useState } from "react";
import type { Embed as Player } from "./embeds.ts";
import styles from "./Embed.module.css";

export interface EmbedProps {
  embed: Player;
  /** The line's verdict from the server's stream; none yet while it waits. */
  verdict: StreamEvent["state"] | undefined;
}

/** A service's player, framed. */
export function PlayerFrame({ embed }: { embed: Player }) {
  return (
    <iframe
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

export function Embed({ embed, verdict }: EmbedProps) {
  const [playing, setPlaying] = useState(false);
  const late = useLate(verdict === undefined);
  if (verdict === "hidden") return null;
  if (playing) return <PlayerFrame embed={embed} />;
  const checked = verdict === "checked";
  return (
    <div className={styles["card"]}>
      <Cluster space="2xs">
        <span>{embed.service}</span>
        <Button
          size="s"
          emphasis="outline"
          disabled={!checked}
          onClick={() => {
            setPlaying(true);
          }}
        >
          {checked
            ? `Play the ${embed.title}`
            : late
              ? "Couldn't check this link"
              : "Waiting for the moderation check…"}
        </Button>
      </Cluster>
    </div>
  );
}
