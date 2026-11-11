// What stands among a room's lines and is none: a day's opening (D13922), a call of the chain, a card of Jarvis.
import { ChainCard } from "./ChainCard.tsx";
import type { Entry } from "./chainEntries.ts";
import type { DayEntry } from "./lineMarks.ts";
import { JarvisSlot, type JarvisEntry } from "./jarvisEntries.tsx";
import styles from "./RoomView.module.css";

// The day a run of lines opens: a separator between them, the label style, held at the list's top while its day is in view. No key
// stops on it (the chain's cards' mark).
function DayDivider({ label }: { label: string }) {
  return (
    <li role="separator" aria-label={label} data-chain="" className={styles["day"]}>
      <span className="label" aria-hidden="true">
        {label}
      </span>
    </li>
  );
}

// What stands among the lines and is none: a call of the chain, or a card of Jarvis.
export function Beside({ entry }: { entry: Exclude<Entry<unknown> | JarvisEntry | DayEntry, { line: unknown }> }) {
  if ("day" in entry) return <DayDivider label={entry.day} />;
  return "jarvis" in entry ? <JarvisSlot item={entry.jarvis} /> : <ChainCard call={entry.call} />;
}
