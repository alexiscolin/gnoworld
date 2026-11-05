// What the chain told of a world's realms (frames 20 to 35): a line for each call, in words from the event alone (who, what, the block it stands
// at), drawn as text and never before its event (ADR-0002 §4). The schema stopped hostile text at the stream; this is the second wall: names
// are capped and stripped of control and bidi characters. A room never draws another universe's calls: a world's name is not unique to a chain.
import type { ChainCall } from "../../store/chain.ts";
import styles from "./ChainLines.module.css";

/** The lines a room draws at most, the newest. */
const SHOWN = 20;

// Text and nothing else: format characters (bidi overrides among them) and controls out, 64 characters at most.
const plain = (text: string): string => text.replace(/[\p{Cf}\p{Cc}]/gu, "").slice(0, 64);
// An address by its two ends: never the whole of it, which a reader could take for a name.
const short = (address: string): string => {
  const text = plain(address);
  return text.length <= 12 ? text : `${text.slice(0, 6)}…${text.slice(-4)}`;
};

export function ChainLines({ lines, universe }: { lines: readonly ChainCall[]; universe: string }) {
  const shown = lines.filter((line) => line.universe === universe).slice(-SHOWN);
  if (shown.length === 0) return null;
  return (
    <ul aria-label="On chain" className={styles["lines"]}>
      {shown.map((line) => (
        <li key={`${String(line.height)}-${line.actor}-${line.func}`}>
          {short(line.actor)} called {plain(line.func)} · block {line.height}
        </li>
      ))}
    </ul>
  );
}
