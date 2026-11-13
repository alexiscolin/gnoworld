// The chat search's results by day, in the order the server gave them (newest arrival first: a day may come back).
import type { SearchHit } from "@gnoworld/schemas";
import { useState, type ReactNode } from "react";
import { dayName } from "../../../lib/days.ts";
import { Hit } from "./Hit.tsx";
import type { ChatSearchProps } from "./ChatSearch.tsx";
import shared from "../lists.module.css";
import styles from "./ChatSearch.module.css";

export function Results({
  pages,
  open,
  onOpen,
}: { pages: readonly (readonly SearchHit[])[] } & Pick<ChatSearchProps, "open" | "onOpen">) {
  const [now] = useState(() => new Date());
  let before: string | undefined;
  const rows: ReactNode[] = [];
  for (const hit of pages.flat()) {
    const day = dayName(new Date(hit.at), now);
    if (day !== before)
      rows.push(
        <li key={`day ${hit.msgid}`} role="presentation" className={["label", styles["day"]].join(" ")}>
          {day}
        </li>,
      );
    before = day;
    rows.push(<Hit key={`${hit.room} ${hit.msgid}`} hit={hit} current={hit.msgid === open} onOpen={onOpen} />);
  }
  return (
    <ul className={[shared["plain"], styles["results"]].join(" ")} aria-label="Results">
      {rows}
    </ul>
  );
}
