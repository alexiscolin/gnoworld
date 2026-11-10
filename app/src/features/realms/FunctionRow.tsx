// One function of a realm as a row that opens in place (the proposal's .fn): its name in the mono with its calls and a chevron, and under it,
// once opened, what it does: its Read or Call button and what that opens (a result, a call card). The list of read functions and the list of
// write functions share it. The body is always drawn and held shut, so it grows (a grid row from 0 to its height) and a button in it is found by a test.
import { Button, Chip, Cluster, Disclosure, Skeleton, Stack } from "@gnoworld/ui";
import { createContext, use, type ReactNode } from "react";
import styles from "./RealmFunctions.module.css";

/** How many times each function was called, from the realm's rollup (by name); a function not in it shows no count. */
export const CallCountsContext = createContext<ReadonlyMap<string, number>>(new Map());

export interface FunctionRowProps {
  name: string;
  /** Open from the start, or opened from outside (the Start here button). */
  open?: boolean;
  /** What the row opens under it. */
  children: ReactNode;
}

export function FunctionRow({ name, open, children }: FunctionRowProps) {
  const calls = use(CallCountsContext).get(name);
  return (
    <Disclosure
      title={
        <code className={styles["code"]} title={name}>
          {name}
        </code>
      }
      trail={
        calls === undefined || calls === 0 ? undefined : (
          <Chip>{`${calls.toLocaleString("en-US")} ${calls === 1 ? "call" : "calls"}`}</Chip>
        )
      }
      {...(open === undefined ? {} : { open })}
    >
      <Stack space="xs">{children}</Stack>
    </Disclosure>
  );
}

/** A function's button in its open row: Read or Call, named for the function. */
export function Act({
  verb,
  name,
  busy = false,
  onClick,
}: {
  verb: "Read" | "Call";
  name: string;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <Cluster>
      <Button emphasis="solid" size="s" icon="play" {...(busy ? { busy: true } : {})} onClick={onClick}>
        {verb}
        <span className="visually-hidden"> {name}</span>
      </Button>
    </Cluster>
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
