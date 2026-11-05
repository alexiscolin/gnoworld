// The strip at the foot of the home (frame 6): the data's news and events in a line that scrolls, 34 px high, with a button
// that pauses it, first in the page's order so a keyboard reaches it before any link. With nothing to show it is not drawn.
import { Icon } from "@gnoworld/ui";
import { useState } from "react";
import styles from "./Ticker.module.css";
import type { TickerItem } from "./ticker.ts";

const KINDS = { news: "News", event: "Event", chain: "Chain" } as const;

export function Ticker({ items }: { items: TickerItem[] }) {
  const [paused, setPaused] = useState(false);
  if (items.length === 0) return null;
  return (
    <section className={styles["ticker"]} data-ticker="" data-paused={paused} aria-label="News and events">
      <button
        type="button"
        className={styles["pause"]}
        aria-label={paused ? "Play the ticker" : "Pause the ticker"}
        aria-pressed={paused}
        onClick={() => {
          setPaused(!paused);
        }}
      >
        <Icon name={paused ? "play" : "pause"} />
      </button>
      <div className={styles["clip"]}>
        <ul className={styles["track"]} data-ticker-track="">
          {items.map((item) => (
            <li key={item.id} className={styles["item"]}>
              <b className={styles["kind"]} data-kind={item.kind}>
                {KINDS[item.kind]}
              </b>
              {/* A realm of the chain opens its page in the app; a news or an event is another site's, opened apart. */}
              <a
                href={item.link}
                className={styles["link"]}
                {...(item.kind === "chain" ? {} : { target: "_blank", rel: "noopener noreferrer" })}
              >
                {item.text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
