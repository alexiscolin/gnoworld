// A realm's write functions (9d, 9e; the call card's first place, frame 33): each a row with a "Call" button that opens the call card
// under it, in the thread and never in a modal; one field, two, more, or none (D254). A function with a type a call does not carry
// has no Call, but a way to the realm on gnoweb. The read functions are RealmFunctions'. The list is read once from `vm/qfuncs`; a card
// reads the indexer once, for its fee line, when it opens, and Adena is asked nothing until its signature.
import { callFields } from "@gnoworld/core";
import { Button, Cluster, PagedList } from "@gnoworld/ui";
import { use, useEffect, useEffectEvent } from "react";
import { gnowebLink } from "../../lib/chain/gnoweb.ts";
import { useAppStore } from "../../storeContext.tsx";
import { Act, CallCountsContext, FunctionRow, PAGE_ROWS, Unlisted } from "./FunctionRow.tsx";
import { InlineCard, openCard, type CallPlace } from "./InlineCard.tsx";
import calm from "./quiet.module.css";
import { useCallable, type Callable, type Listing } from "./useCallable.ts";

export interface RealmWritesProps extends CallPlace {
  chain: CallPlace["chain"] & { gnoweb: string };
  /** Told how many write functions there are, once listed (the tab's count). */
  onCount?: (count: number) => void;
  /** The card is open in place: the hundred rows at once. */
  expanded?: boolean;
  /** A function to open with its call card, from outside (the Start here button); `n` counts the presses, so a second one opens it again. */
  opening?: { name: string; n: number } | undefined;
  /** The person shut the opened row: the ask is over, and Start here asks again. */
  onShut?: () => void;
}

// The functions a call can carry, and the write ones it cannot (a type it does not carry); a read, or a hostile name, is neither.
const carried = (each: Callable): boolean | undefined => {
  const fields = callFields(each.params);
  return fields.ok ? true : fields.why === "gnoweb" ? false : undefined;
};

/** Where to start: the write most called, as the rollup counts it, among those a call can carry; none before any was called. */
export function startHere(
  listing: Listing,
  counts: ReadonlyMap<string, number>,
): { name: string; calls: number } | undefined {
  if (listing.state !== "listed") return undefined;
  const called = listing.functions
    .filter((each) => carried(each) === true)
    .map(({ name }) => ({ name, calls: counts.get(name) ?? 0 }))
    .filter(({ calls }) => calls > 0);
  return called.toSorted((a, b) => b.calls - a.calls)[0];
}

// One function: its Call button in its open row, and its card under it once opened.
function WriteRow({
  write,
  opening,
  onShut,
  ...place
}: CallPlace & { write: Callable; opening: RealmWritesProps["opening"]; onShut: (() => void) | undefined }) {
  const store = useAppStore();
  const id = `${place.chain.chainId} ${place.realm}.${write.name}`;
  const call = useEffectEvent(() => {
    openCard(store, { id, place, write });
  });
  const mine = opening?.name === write.name;
  useEffect(() => {
    if (mine) call();
  }, [mine, opening?.n]);
  return (
    <FunctionRow
      name={write.name}
      params={write.params}
      open={mine}
      onToggle={(open) => {
        if (!open && mine) onShut?.();
      }}
    >
      <Act
        verb="Call"
        name={write.name}
        onClick={() => {
          openCard(store, { id, place, write });
        }}
      />
      <InlineCard id={id} place={place} />
    </FunctionRow>
  );
}

// A function a call cannot carry: no Call, and the realm on gnoweb, which can.
function GnowebRow({ name, params, href }: { name: string; params: Callable["params"]; href: string | undefined }) {
  return (
    <FunctionRow name={name} params={params}>
      <p className={[calm["box"], "fill-box"].join(" ")}>
        Writes to the chain: its arguments are signed on the realm's page on gnoweb.
      </p>
      {href === undefined ? null : (
        <Cluster>
          <Button emphasis="outline" size="s" icon="arrow-up-right" href={href}>
            Open in gnoweb
            <span className="visually-hidden"> for {name}</span>
          </Button>
        </Cluster>
      )}
    </FunctionRow>
  );
}

function Rows({
  functions,
  expanded,
  opening,
  onShut,
  ...place
}: RealmWritesProps & { functions: Callable[]; expanded: boolean }) {
  const href = gnowebLink(place.chain.gnoweb, place.realm);
  const { chain, realm, options } = place;
  const here: CallPlace = { chain, realm, options };
  const counts = use(CallCountsContext);
  // The realm's own order, by calls once the rollup has counted them, by name.
  const sorts = [
    { id: "listed", label: "Listed", compare: () => 0 },
    {
      id: "calls",
      label: "By calls",
      compare: (a: Callable, b: Callable) => (counts.get(b.name) ?? 0) - (counts.get(a.name) ?? 0),
    },
    { id: "name", label: "By name", compare: (a: Callable, b: Callable) => a.name.localeCompare(b.name) },
  ].filter(({ id }) => id !== "calls" || counts.size > 0);
  return (
    <PagedList
      label="write functions"
      items={functions}
      keyOf={(write) => write.name}
      textOf={(write) => write.name}
      sorts={sorts}
      expanded={expanded}
      counted={functions.length > PAGE_ROWS}
      {...(href === undefined ? {} : { explorer: { href, label: "More on gnoweb" } })}
      render={(write) =>
        carried(write) === true ? (
          <WriteRow write={write} opening={opening} onShut={onShut} {...here} />
        ) : (
          <GnowebRow name={write.name} params={write.params} href={href} />
        )
      }
    />
  );
}

function Body({ onCount, expanded = false, ...props }: RealmWritesProps) {
  const listing = useCallable(props.chain.rpc, props.realm, props.options);
  // The ones a call can carry first; those it cannot stay listed after them, with their way to gnoweb, and are not counted.
  const functions =
    listing.state === "listed"
      ? listing.functions.filter((each) => carried(each) !== undefined).toSorted((a, b) => +!carried(a) - +!carried(b))
      : [];
  const count = listing.state === "listed" ? functions.filter((each) => carried(each) === true).length : undefined;
  useEffect(() => {
    if (count !== undefined) onCount?.(count);
  }, [count, onCount]);
  if (listing.state !== "listed")
    return <Unlisted listing={listing} href={gnowebLink(props.chain.gnoweb, props.realm)} />;
  if (functions.length === 0) return <p className={calm["note"]}>There is no write function to call here.</p>;
  return <Rows {...props} functions={functions} expanded={expanded} />;
}

/** A realm's write functions as rows, each opening its call card; read again, from nothing, when the realm or the chain change. */
export function RealmWrites(props: RealmWritesProps) {
  return (
    <section aria-label="Write functions">
      <Body {...props} />
    </section>
  );
}
