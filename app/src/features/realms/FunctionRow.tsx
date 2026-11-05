// One function of a realm as a row: its name and one small outlined button, "Read" or "Call", named for the function, and what the row
// opens under it (a result, a call card). The list of read functions and the list of write functions share it.
import { Button, Skeleton } from "@gnoworld/ui";
import type { ReactNode } from "react";
import styles from "./RealmFunctions.module.css";

export interface FunctionRowProps {
  name: string;
  /** The button's word. */
  verb: "Read" | "Call";
  busy?: boolean;
  onClick: () => void;
  /** What the row opens under it. */
  children?: ReactNode;
}

export function FunctionRow({ name, verb, busy = false, onClick, children }: FunctionRowProps) {
  return (
    <li className={styles["item"]}>
      <div className={styles["line"]}>
        <span className={styles["name"]}>{name}</span>
        <Button emphasis="outline" size="s" {...(busy ? { busy: true } : {})} onClick={onClick}>
          {verb}
          <span className="visually-hidden"> {name}</span>
        </Button>
      </div>
      {children}
    </li>
  );
}

/** What a list of functions shows while it is read, or when it could not be: the skeleton, or the next step. */
export function Unlisted({ listing }: { listing: { state: "loading" } | { state: "failed"; next: string } }) {
  if (listing.state === "failed") return <p role="status">{listing.next}</p>;
  return (
    <div aria-busy="true" aria-label="Reading the functions">
      <Skeleton lines={2} />
    </div>
  );
}
