// A realm's write functions with one or two fields (9d, the call card's first place, frame 33): each a row with a "Call" button
// that opens the call card under it, in the thread and never in a modal. The read functions are RealmFunctions'; a call of more
// fields, of a type a call does not carry, of none, `<gno-form>`, votes and quick actions are 9e's. The list is read once from
// `vm/qfuncs`; a card reads the indexer once, for its fee line, when it opens, and Adena is asked nothing until its signature.
import { callFields } from "@gnoworld/core";
import { readCallFees, type CallFees } from "@gnoworld/chain/fees";
import type { ReadOptions } from "@gnoworld/chain/read";
import { Stack } from "@gnoworld/ui";
import { useEffect, useState } from "react";
import { CallCard, ensureCalls, feeText, signInPage } from "../calls/index.ts";
import { readCallable } from "../../lib/chain/rpc.ts";
import { useApp, useAppStore } from "../../storeContext.tsx";
import { FunctionRow, Unlisted } from "./FunctionRow.tsx";
import styles from "./RealmFunctions.module.css";

export interface RealmWritesProps {
  realm: string;
  /** The universe it is read from and signed on. */
  chain: { name: string; chainId: string; rpc: string; indexer: string };
  options?: ReadOptions;
}

// A rejection here is a bug, not a state: the browser's own report, as the other panels' are.
const report = (error: unknown): void => {
  reportError(error);
};

interface Write {
  name: string;
  params: { Name: string; Type: string }[];
}
type Listing = { state: "loading" } | { state: "listed"; writes: Write[] } | { state: "failed"; next: string };

// The functions a card calls: one or two fields, of the types a call carries; none of a read, of three, or of none.
const hasOneOrTwoFields = (params: Write["params"]): boolean => {
  const fields = callFields(params);
  return fields.ok && fields.fields.length >= 1 && fields.fields.length <= 2;
};

function useWrites({ chain, realm, options }: RealmWritesProps): Listing {
  const [listing, setListing] = useState<Listing>({ state: "loading" });
  useEffect(() => {
    readCallable(chain.rpc, realm, options)
      .then((read) => {
        setListing(
          read.ok
            ? { state: "listed", writes: read.value.filter(({ params }) => hasOneOrTwoFields(params)) }
            : { state: "failed", next: read.failure.next },
        );
      })
      .catch(report);
  }, [chain.rpc, realm, options]);
  return listing;
}

// The card of a row: the fee read once when it opens, its words from the course the store holds.
function Card({
  id,
  chain,
  options,
}: {
  id: string;
  chain: RealmWritesProps["chain"];
  options?: ReadOptions | undefined;
}) {
  const store = useAppStore();
  const card = useApp((state) => state.calls[id]);
  const [fees, setFees] = useState<CallFees | undefined>(undefined);
  const { realm, func } = card ?? { realm: "", func: "" };
  useEffect(() => {
    readCallFees(chain.indexer, { realm, func }, options)
      .then((read) => {
        setFees(read.ok ? read.value : undefined);
      })
      .catch(report);
  }, [chain.indexer, realm, func, options]);
  if (card === undefined) return null;
  const { callsActions } = store.getState();
  const { name, chainId, rpc } = chain;
  return (
    <CallCard
      card={card}
      network={{ name, chainId }}
      fee={feeText(fees)}
      onEdit={(index, text) => {
        callsActions.edit(id, index, text);
      }}
      onSign={() => {
        signInPage(id, store, { chainId, name, rpc }).catch(report);
      }}
      onCancel={() => {
        callsActions.close(id);
      }}
      onRetry={() => {
        callsActions.retry(id);
      }}
    />
  );
}

// One function: its Call button, and its card under it once opened.
function WriteRow({ write, realm, chain, options }: RealmWritesProps & { write: Write }) {
  const { open } = useAppStore().getState().callsActions;
  const id = `${chain.chainId} ${realm}.${write.name}`;
  const opened = useApp((state) => state.calls[id] !== undefined);
  return (
    <FunctionRow
      name={write.name}
      verb="Call"
      onClick={() => {
        open({ id, chainId: chain.chainId, realm, func: write.name, params: write.params });
      }}
    >
      {opened ? <Card id={id} chain={chain} options={options} /> : null}
    </FunctionRow>
  );
}

function Rows({ writes, ...rest }: RealmWritesProps & { writes: Write[] }) {
  return (
    <ul className={styles["list"]}>
      {writes.map((write) => (
        <WriteRow key={write.name} write={write} {...rest} />
      ))}
    </ul>
  );
}

function Body(props: RealmWritesProps) {
  const listing = useWrites(props);
  if (listing.state !== "listed") return <Unlisted listing={listing} />;
  if (listing.writes.length === 0) return <p>There is no write function to call here.</p>;
  return <Rows {...props} writes={listing.writes} />;
}

/** A realm's write functions as rows, each opening its call card; read again, from nothing, when the realm or the chain change. */
export function RealmWrites(props: RealmWritesProps) {
  const store = useAppStore();
  // The rows come once the list is read, after this has run: they find the slice there.
  useEffect(() => {
    ensureCalls(store);
  }, [store]);
  return (
    <section key={`${props.chain.chainId} ${props.chain.rpc} ${props.realm}`} aria-label="Write functions">
      <Stack space="xs">
        <h2>Write functions</h2>
        <Body {...props} />
      </Stack>
    </section>
  );
}
