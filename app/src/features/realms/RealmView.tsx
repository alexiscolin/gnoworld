// A realm's page, the plate's lower half (5h, D375): the realm's Markdown read from the chain once (useRealm), drawn as the allowlisted
// blocks of core's reader, scrolling inside the plate, then its functions. Every state names the way out: the link to the realm on gnoweb
// (ADR-0002 §4, gnoweb is the source of truth) stands on the page whatever it holds, with the height it was read at, the cap's state or the
// failed read's state and its next step. The frame, the title and the realm's card are the route's (routes/realmPage.tsx).
import type { ReactNode } from "react";
import { Button, Card, Skeleton, Stack } from "@gnoworld/ui";
import { gnowebLink } from "../../lib/chain/gnoweb.ts";
import { hostOf, type Failure, type ReadOptions } from "@gnoworld/chain/read";
import { bigLine } from "./RealmCard.tsx";
import type { CallPlace } from "./InlineCard.tsx";
import { RealmBlocks } from "./RealmBlocks.tsx";
import { RealmFunctions } from "./RealmFunctions.tsx";
import { RealmWrites } from "./RealmWrites.tsx";
import styles from "./RealmView.module.css";
import { isHeight, useRealm, type Height, type Realm } from "./useRealm.ts";
import { ListingContext, useRead } from "./useCallable.ts";

export interface RealmViewProps {
  /** The realm, `gno.land/r/demo/dao`. */
  realm: string;
  /** The universe it is read from. */
  chain: { name: string; chainId: string; rpc: string; gnoweb: string; indexer: string };
  /** lib/chain's options, for a test's fetch. */
  options?: ReadOptions;
  /** What stands between the page and its functions: the explorer's facts (Alexis, 2026-11-08: "avant les fonctions, après le
   * readme"). */
  between?: ReactNode;
  /** The functions come before the page: the plate's main action is to try them (D534). */
  functionsFirst?: boolean;
}

// Where the page was read: the block's height and time, or why neither is known.
function Read({ height, rpc }: { height: Height | Failure; rpc: string }) {
  if (!isHeight(height)) return <p className={"meta"}>The block height could not be read. {height.next}</p>;
  return (
    <p className={"meta"}>
      Read at block {new Intl.NumberFormat("en-US").format(height.height)}, {height.time}, from{" "}
      <span dir="ltr">{hostOf(rpc)}</span>
    </p>
  );
}

function Body({
  state,
  origin,
  link,
  call,
}: {
  state: Realm;
  origin: string | undefined;
  link: string | undefined;
  call: CallPlace;
}) {
  if (state.state === "loading") {
    return (
      <div aria-busy="true" aria-label="Reading the page">
        <Skeleton lines={4} />
      </div>
    );
  }
  if (state.state === "failed") {
    return (
      <div role="alert">
        <Stack space="xs">
          <h2>This page could not be read here</h2>
          <p>
            {state.failure === undefined ? "The page could not be drawn. Try again in a moment." : state.failure.next}
          </p>
          {/* The page's one retry (D534): the facts and the calls under it say nothing of their own when the chain is down. */}
          <Button
            icon="spark"
            onClick={() => {
              location.reload();
            }}
          >
            Try again
          </Button>
        </Stack>
      </div>
    );
  }
  if (state.page.kind === "too-big") {
    return (
      <Stack space="xs">
        <h2>This page is too large</h2>
        <p>{bigLine(state.page.cap)}</p>
      </Stack>
    );
  }
  return (
    <RealmBlocks
      blocks={state.page.blocks}
      via={state.via}
      call={call}
      {...(origin === undefined ? {} : { origin })}
      {...(link === undefined ? {} : { more: link })}
    />
  );
}

export function RealmView({ realm, chain, options, between, functionsFirst = false }: RealmViewProps) {
  const origin = chain.gnoweb;
  const link = gnowebLink(origin, realm);
  const state = useRealm({ rpc: chain.rpc, realm, origin }, options);
  const place: CallPlace = { realm, chain, options };
  const listing = useRead({ rpc: chain.rpc, realm, options });
  const functions = (
    <section id="functions" aria-label="The realm's functions">
      <Stack space="m">
        <RealmFunctions realm={realm} chain={chain} {...(options === undefined ? {} : { options })} />
        <RealmWrites realm={realm} chain={chain} {...(options === undefined ? {} : { options })} />
      </Stack>
    </section>
  );
  return (
    <ListingContext value={listing}>
      {functionsFirst ? functions : null}
      {/* The realm's page, read in the plate: a long one scrolls inside it, as the dock's room does. */}
      <section id="page" aria-label="The realm's page">
        <Card compact>
          <Card.Header title="Render" level={2} />
          <Card.Body>
            <div className={styles["page"]} data-selectable="">
              <Stack space="xs">
                <Body state={state} origin={origin} link={link} call={place} />
                {state.state === "read" ? <Read height={state.height} rpc={chain.rpc} /> : null}
              </Stack>
            </div>
          </Card.Body>
          {/* gnoworld's own way out, a button under the card's body, apart from what the realm wrote (Alexis, 2026-11-07). */}
          {link === undefined ? null : (
            <Card.Actions>
              <Button href={link} emphasis="outline" size="s" icon="arrow-up-right">
                Open on gnoweb
              </Button>
            </Card.Actions>
          )}
        </Card>
      </section>
      {between}
      {functionsFirst ? null : functions}
    </ListingContext>
  );
}
