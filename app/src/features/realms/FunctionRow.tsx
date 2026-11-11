// One function of a realm as a row that opens in place (the proposal's .fn): its name in the mono with its calls and a chevron, and under it,
// once opened, what it does: its Read or Call button and what that opens (a result, a call card). The list of read functions and the list of
// write functions share it. The body is always drawn and held shut, so it grows (a grid row from 0 to its height) and a button in it is found by a test.
import { realmType } from "@gnoworld/core";
import { Button, Chip, Cluster, Disclosure, Skeleton, Stack } from "@gnoworld/ui";
import { createContext, use, type ReactNode } from "react";
import styles from "./RealmFunctions.module.css";

/** How many times each function was called, from the realm's rollup (by name); a function not in it shows no count. */
export const CallCountsContext = createContext<ReadonlyMap<string, number>>(new Map());

export interface FunctionRowProps {
  name: string;
  /** Its arguments, shown after the name as the signature; a read takes none. */
  params?: readonly { Name: string; Type: string }[];
  /** Open from the start, or opened from outside (the Start here button). */
  open?: boolean;
  /** Told, with the state it now has, when the person opens or shuts the row (a read reads on its opening). */
  onToggle?: (open: boolean) => void;
  /** What the row opens under it. */
  children: ReactNode;
}

/** How many rows a list draws before it pages: a shorter list needs no foot that counts it. */
export const PAGE_ROWS = 12;

const NO_PARAMS: readonly { Name: string; Type: string }[] = [];

export function FunctionRow({ name, params = NO_PARAMS, open, onToggle, children }: FunctionRowProps) {
  const calls = use(CallCountsContext).get(name);
  const signature = `${name}(${params.map(({ Name, Type }) => `${Name} ${Type === realmType() ? "realm" : Type}`).join(", ")})`;
  return (
    <Disclosure
      lead={null}
      title={
        <code className={styles["code"]} title={signature}>
          {signature}
        </code>
      }
      trail={
        calls === undefined || calls === 0 ? undefined : (
          <Chip>{`${calls.toLocaleString("en-US")} ${calls === 1 ? "call" : "calls"}`}</Chip>
        )
      }
      {...(open === undefined ? {} : { open })}
      {...(onToggle === undefined ? {} : { onToggle })}
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

/** The way out of a state that stops short: the realm on gnoweb, where the rest is done. */
export function OpenOnGnoweb({ href }: { href: string | undefined }) {
  if (href === undefined) return null;
  return (
    <Cluster>
      <Button emphasis="outline" size="s" icon="arrow-up-right" href={href}>
        Open on gnoweb
      </Button>
    </Cluster>
  );
}

/** What a list of functions shows while it is read, or when it could not be: the skeleton (in words once a try has failed), or the next
 * step with the way to gnoweb. */
export function Unlisted({
  listing,
  href,
}: {
  listing: { state: "loading"; retrying?: boolean } | { state: "failed"; next: string };
  href: string | undefined;
}) {
  if (listing.state === "failed")
    return (
      <Stack space="xs">
        <p role="status">{listing.next}</p>
        <OpenOnGnoweb href={href} />
      </Stack>
    );
  return (
    <div aria-busy="true" aria-label="Reading the functions">
      <Skeleton lines={2} />
      {listing.retrying === true ? <p role="status">Trying again…</p> : null}
    </div>
  );
}
