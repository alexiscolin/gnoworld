// The strip at the foot of the home (frame 6): the chain's trends and the data's news and events in a line that scrolls, 34 px high, with a
// button that pauses it, first in the page's order so a keyboard reaches it before any link. With nothing to show it is not drawn. A trend
// opens its world here, through the router; a news or an event opens another site.
import { Icon } from "@gnoworld/ui";
import { useState } from "react";
import { Link } from "react-router";
import styles from "./Ticker.module.css";
import type { TickerItem } from "./ticker.ts";

// Each kind in a word, upper case as the video draws them (frames 4, 16, 18).
const KINDS: Record<TickerItem["kind"], string> = {
  trending: "Trending",
  rising: "Rising",
  new: "New",
  news: "News",
  event: "Event",
};

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
              {item.kind === "news" || item.kind === "event" ? (
                <a href={item.link} target="_blank" rel="noopener noreferrer" className={styles["link"]}>
                  {item.text}
                </a>
              ) : (
                <Link to={item.link} title={item.source} className={styles["link"]}>
                  {item.text}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
