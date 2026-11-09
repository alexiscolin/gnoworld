// A realm's read functions (5i, ADR-0002 §4): the ones that take nothing and give something, listed once from `vm/qfuncs`,
// each a row with a Read button that reads its result once through `vm/qeval` when clicked. A read is free and signs nothing: the label says
// so, with the block height it was read at, and no wallet is ever asked. One request a view for the list, two a click (the
// call, shown first, and the height, which follows it); nothing polls. The names are lib/chain's (one exported identifier or none); a long list is drawn a
// hundred at a time and searched whole. Every state keeps the link to the realm on gnoweb, where the rest is done.
import { Button, Cluster, Field, Stack } from "@gnoworld/ui";
import { useState } from "react";
import type { ReadOptions } from "@gnoworld/chain/read";
import edge from "./frame.module.css";
import { FunctionRow, Unlisted } from "./FunctionRow.tsx";
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
}

/** Functions drawn at first, and added by each "Show more": the list is the realm's own and can be long. */
const PAGE = 100;
/** The search shows from this many functions on: a short list is read at a glance. */
const SEARCH_FROM = 11;

function Outcome({ name, result }: { name: string; result: Result | undefined }) {
  if (result === undefined || result.state === "busy") return null;
  if (result.state === "failed") return <p role="status">{result.next}</p>;
  const { height } = result;
  return (
    <>
      {/* A result taller than its frame scrolls: the frame takes focus and has a name, so a keyboard reaches the rest. */}
      <pre
        className={[edge["frame"], styles["result"]].join(" ")}
        dir="ltr"
        tabIndex={0}
        role="region"
        aria-label={`Result of ${name}`}
      >
        {result.text}
      </pre>
      <p className={"meta"}>
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

// The functions as rows, searchable from SEARCH_FROM on and drawn PAGE at a time.
function Items({ names, results, read }: { names: string[]; results: Functions["results"]; read: Functions["read"] }) {
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  const needle = query.trim().toLowerCase();
  const found = needle === "" ? names : names.filter((name) => name.toLowerCase().includes(needle));
  return (
    <>
      {names.length >= SEARCH_FROM ? (
        <Field
          kind="search"
          label="Find a function"
          hideLabel
          placeholder="Find a function"
          value={query}
          onChange={(value) => {
            setQuery(value);
            setShown(PAGE);
          }}
        />
      ) : null}
      {found.length === 0 ? <p>No function matches your search.</p> : null}
      <ul className={styles["list"]}>
        {found.slice(0, shown).map((name) => (
          <FunctionRow
            key={name}
            name={name}
            verb="Read"
            busy={results[name]?.state === "busy"}
            onClick={() => {
              read(name);
            }}
          >
            <Outcome name={name} result={results[name]} />
          </FunctionRow>
        ))}
      </ul>
      {found.length > shown ? (
        <Cluster space="s">
          <span className={"meta"}>
            Showing {shown} of {new Intl.NumberFormat("en-US").format(found.length)}
          </span>
          <Button
            onClick={() => {
              setShown(shown + PAGE);
            }}
          >
            Show more
          </Button>
        </Cluster>
      ) : null}
    </>
  );
}

function Body({ functions }: { functions: Functions }) {
  const { listing, results, read } = functions;
  if (listing.state !== "listed") return <Unlisted listing={listing} />;
  if (listing.names.length === 0) return <p>There is no function to read here.</p>;
  return <Items names={listing.names} results={results} read={read} />;
}

function Panel({ realm, chain, options }: RealmFunctionsProps) {
  const functions = useFunctions(chain.rpc, realm, options);
  return (
    <section aria-label="Read functions">
      <Stack space="xs">
        <h2 className={styles["title"]}>Read functions</h2>
        <Body functions={functions} />
      </Stack>
    </section>
  );
}

/** A realm's read functions; read again, from nothing, when the realm or the chain change. */
export function RealmFunctions(props: RealmFunctionsProps) {
  return <Panel key={`${props.chain.chainId} ${props.chain.rpc} ${props.realm}`} {...props} />;
}
