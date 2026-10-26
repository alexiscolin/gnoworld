// A link's player (slice 4's 4g; ADR-0002 §6): a card naming the service, its button waiting on the moderation's
// "checked"; the service's own frame on a click alone, so no third party is reached before. A hidden line's, none.
import type { StreamEvent } from "@gnoworld/schemas";
import { Button, Cluster } from "@gnoworld/ui";
import { useState } from "react";
import type { Embed as Player } from "./embeds.ts";
import styles from "./Embed.module.css";

export interface EmbedProps {
  embed: Player;
  /** The line's verdict from the server's stream; none yet while it waits. */
  verdict: StreamEvent["state"] | undefined;
}

// The site sends no referrer (F682). YouTube's player asks for the embedding site's identity in it, this policy the
// one it recommends (developers.google.com/youtube/terms/required-minimum-functionality): the origin, nothing more.
const REFERRER = {
  YouTube: "strict-origin-when-cross-origin",
  Vimeo: "no-referrer",
  Giphy: "no-referrer",
} as const satisfies Record<Player["service"], string>;

/** A service's player, framed. */
export function PlayerFrame({ embed }: { embed: Player }) {
  return (
    <iframe
      src={embed.src}
      title={embed.title}
      className={styles["frame"]}
      allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
      allowFullScreen
      referrerPolicy={REFERRER[embed.service]}
      // The player's own scripts, full screen and its links out, in an origin of its own: never this page's.
      sandbox="allow-scripts allow-presentation allow-popups"
    />
  );
}

export function Embed({ embed, verdict }: EmbedProps) {
  const [playing, setPlaying] = useState(false);
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
          {checked ? `Play the ${embed.title}` : "Waiting for the moderation check…"}
        </Button>
      </Cluster>
    </div>
  );
}
