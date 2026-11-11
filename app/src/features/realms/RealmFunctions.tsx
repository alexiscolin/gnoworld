// A realm's read functions (5i, ADR-0002 §4): the ones that take nothing and give something, listed once from `vm/qfuncs`,
// each a row with a Read button that reads its result once through `vm/qeval` when clicked. A read is free and signs nothing: the label says
// so, with the block height it was read at, and no wallet is ever asked. One request a view for the list, two a click (the
// call, shown first, and the height, which follows it); nothing polls. The names are lib/chain's (one exported identifier or none); a long list is drawn a
// hundred at a time and searched whole. Every state keeps the link to the realm on gnoweb, where the rest is done.
import { PagedList } from "@gnoworld/ui";
import type { ReadOptions } from "@gnoworld/chain/read";
import { use, useEffect } from "react";
import { gnowebLink } from "../../lib/chain/gnoweb.ts";
import { Act, CallCountsContext, FunctionRow, OpenOnGnoweb, PAGE_ROWS, Unlisted } from "./FunctionRow.tsx";
import calm from "./quiet.module.css";
import styles from "./RealmFunctions.module.css";
import { useFunctions, type Functions, type Result } from "./useFunctions.ts";
import { isHeight } from "./useRealm.ts";

export interface RealmFunctionsProps {
  /** The realm, `gno.land/r/demo/dao`. */
  realm: string;
  /** The universe it is read from. */
  chain: { name: string; chainId: string; rpc: string; gnoweb: string };
  /** lib/chain's options, for a test's fetch. */
  options?: ReadOptions;
  /** Told how many read functions there are, once listed (the tab's count). */
  onCount?: (count: number) => void;
  /** The card is open in place: the hundred rows at once. */
  expanded?: boolean;
}

function Outcome({ name, result, href }: { name: string; result: Result | undefined; href: string | undefined }) {
  if (result === undefined || result.state === "busy") return null;
  if (result.state === "failed")
    return (
      <>
        <p role="status">{result.next}</p>
        <OpenOnGnoweb href={href} />
      </>
    );
  const { height } = result;
  return (
    <>
      {/* A result taller than its frame scrolls: the frame takes focus and has a name, so a keyboard reaches the rest. */}
      <pre className={styles["result"]} dir="ltr" tabIndex={0} role="region" aria-label={`Result of ${name}`}>
        {result.text}
      </pre>
      <p className={calm["note"]}>
        read on chain, free, no signature
        {height === undefined
          ? null
          : isHeight(height)
            ? `, at block ${new Intl.NumberFormat("en-US").format(height.height)}`
            : `. The block height could not be read. ${height.next}`}
      </p>
    </>
  );
}

// The functions as rows: the design system's paged list, its filter, its closed orders, 12 then up to 100 and the realm on gnoweb past them.
function Items({
  names,
  results,
  read,
  more,
  expanded,
  href,
}: {
  names: string[];
  results: Functions["results"];
  read: Functions["read"];
  more: string | undefined;
  expanded: boolean;
  href: string | undefined;
}) {
  const counts = use(CallCountsContext);
  // The realm's own order, by calls once the rollup has counted them, by name.
  const sorts = [
    { id: "listed", label: "Listed", compare: () => 0 },
    { id: "calls", label: "By calls", compare: (a: string, b: string) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) },
    { id: "name", label: "By name", compare: (a: string, b: string) => a.localeCompare(b) },
  ].filter(({ id }) => id !== "calls" || counts.size > 0);
  return (
    <PagedList
      label="read functions"
      items={names}
      keyOf={(name) => name}
      textOf={(name) => name}
      sorts={sorts}
      expanded={expanded}
      counted={names.length > PAGE_ROWS}
      {...(more === undefined ? {} : { explorer: { href: more, label: "More on gnoweb" } })}
      empty="No function matches your search."
      render={(name) => (
        <FunctionRow
          name={name}
          onToggle={(open) => {
            if (open && results[name] === undefined) read(name);
          }}
        >
          <Act
            verb="Read"
            name={name}
            busy={results[name]?.state === "busy"}
            onClick={() => {
              read(name);
            }}
          />
          <Outcome name={name} result={results[name]} href={href} />
        </FunctionRow>
      )}
    />
  );
}

function Body({ functions, more, expanded }: { functions: Functions; more: string | undefined; expanded: boolean }) {
  const { listing, results, read } = functions;
  if (listing.state !== "listed") return <Unlisted listing={listing} href={more} />;
  if (listing.names.length === 0) return <p className={calm["note"]}>There is no function to read here.</p>;
  return <Items names={listing.names} results={results} read={read} more={more} expanded={expanded} href={more} />;
}

function Panel({ realm, chain, options, onCount, expanded = false }: RealmFunctionsProps) {
  const functions = useFunctions(chain.rpc, realm, options);
  const { listing } = functions;
  const count = listing.state === "listed" ? listing.names.length : undefined;
  useEffect(() => {
    if (count !== undefined) onCount?.(count);
  }, [count, onCount]);
  return (
    <section aria-label="Read functions">
      <Body functions={functions} more={gnowebLink(chain.gnoweb, realm)} expanded={expanded} />
    </section>
  );
}

/** A realm's read functions; read again, from nothing, when the realm or the chain change. */
export function RealmFunctions(props: RealmFunctionsProps) {
  return <Panel key={`${props.chain.chainId} ${props.chain.rpc} ${props.realm}`} {...props} />;
}
