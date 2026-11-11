// A result of the chat's search: its author, its room and its time, then its words with the ones searched marked. The words are the
// message's, drawn as text and never as markup; the marks are the server's offsets (marks.ts).
import type { SearchHit } from "@gnoworld/schemas";
import { CLOCK, FULL } from "../LineHead.tsx";
import { roomLabel, isAccount } from "../names.ts";
import { Person } from "../Person.tsx";
import { pieces } from "./marks.ts";
import styles from "./ChatSearch.module.css";

export function Hit({ hit, current, onOpen }: { hit: SearchHit; current: boolean; onOpen: (hit: SearchHit) => void }) {
  const at = new Date(hit.at);
  return (
    <li>
      <button
        type="button"
        data-hit=""
        className={styles["hit"]}
        aria-current={current ? "true" : undefined}
        onClick={() => {
          onOpen(hit);
        }}
      >
        <span className={styles["row"]}>
          <span className={styles["top"]}>
            <span className="meta">
              <b className={styles["who"]}>
                <Person name={hit.account} guest={!isAccount(hit.account)} />
              </b>{" "}
              {roomLabel(hit.room)}
            </span>
            <time className="meta" dateTime={at.toISOString()} title={FULL.format(at)}>
              {CLOCK.format(at)}
            </time>
          </span>
          <span className={styles["snippet"]}>
            {pieces(hit.text, hit.marks).map(({ text, marked, at: start }) =>
              marked ? <mark key={start}>{text}</mark> : text,
            )}
          </span>
        </span>
      </button>
    </li>
  );
}
