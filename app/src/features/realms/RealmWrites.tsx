// A realm's write functions (9d, 9e; the call card's first place, frame 33): each a row with a "Call" button that opens the call card
// under it, in the thread and never in a modal; one field, two, more, or none (D254). A function with a type a call does not carry
// has no Call, but a way to the realm on gnoweb. The read functions are RealmFunctions'. The list is read once from `vm/qfuncs`; a card
// reads the indexer once, for its fee line, when it opens, and Adena is asked nothing until its signature.
import { callFields } from "@gnoworld/core";
import { Button, Stack } from "@gnoworld/ui";
import { gnowebLink } from "../../lib/chain/gnoweb.ts";
import { useAppStore } from "../../storeContext.tsx";
import { FunctionRow, Unlisted } from "./FunctionRow.tsx";
import { InlineCard, openCard, type CallPlace } from "./InlineCard.tsx";
import styles from "./RealmFunctions.module.css";
import { useCallable, type Callable } from "./useCallable.ts";

export interface RealmWritesProps extends CallPlace {
  chain: CallPlace["chain"] & { gnoweb: string };
}

// The functions a call can carry, and the write ones it cannot (a type it does not carry); a read, or a hostile name, is neither.
const carried = (each: Callable): boolean | undefined => {
  const fields = callFields(each.params);
  return fields.ok ? true : fields.why === "gnoweb" ? false : undefined;
};

// One function: its Call button, and its card under it once opened.
function WriteRow({ write, ...place }: CallPlace & { write: Callable }) {
  const store = useAppStore();
  const id = `${place.chain.chainId} ${place.realm}.${write.name}`;
  return (
    <FunctionRow
      name={write.name}
      verb="Call"
      onClick={() => {
        openCard(store, { id, place, write });
      }}
    >
      <InlineCard id={id} place={place} />
    </FunctionRow>
  );
}

// A function a call cannot carry: no Call, and the realm on gnoweb, which can.
function GnowebRow({ name, href }: { name: string; href: string | undefined }) {
  return (
    <li className={styles["item"]}>
      <div className={styles["line"]}>
        <span className={styles["name"]}>{name}</span>
        {href === undefined ? null : (
          <Button emphasis="outline" size="s" href={href}>
            Open in gnoweb
            <span className="visually-hidden"> for {name}</span>
          </Button>
        )}
      </div>
    </li>
  );
}

function Rows({ functions, ...place }: RealmWritesProps & { functions: Callable[] }) {
  const href = gnowebLink(place.chain.gnoweb, place.realm);
  const { chain, realm, options } = place;
  const here: CallPlace = { chain, realm, options };
  return (
    <ul className={styles["list"]}>
      {functions.map((write) =>
        carried(write) === true ? (
          <WriteRow key={write.name} write={write} {...here} />
        ) : (
          <GnowebRow key={write.name} name={write.name} href={href} />
        ),
      )}
    </ul>
  );
}

function Body(props: RealmWritesProps) {
  const listing = useCallable(props.chain.rpc, props.realm, props.options);
  if (listing.state !== "listed") return <Unlisted listing={listing} />;
  const functions = listing.functions.filter((each) => carried(each) !== undefined);
  if (functions.length === 0) return <p>There is no write function to call here.</p>;
  return <Rows {...props} functions={functions} />;
}

/** A realm's write functions as rows, each opening its call card; read again, from nothing, when the realm or the chain change. */
export function RealmWrites(props: RealmWritesProps) {
  return (
    <section aria-label="Write functions">
      <Stack space="xs">
        <h2>Write functions</h2>
        <Body {...props} />
      </Stack>
    </section>
  );
}
