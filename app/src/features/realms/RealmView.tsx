// A realm's page, as a view of its own (5h): a full page, in place of the world's page and its chat, with its own address and a back button, the realm's
// Markdown read from the chain once (useRealm) and drawn as the allowlisted blocks of core's reader. Every state names the way
// out: the link to the realm on gnoweb (ADR-0002 §4, gnoweb is the source of truth) is on the view whatever it holds, with
// the height it was read at, the cap's state or the failed read's state and its next step.
import { Button, Center, Cluster, Kicker, Skeleton, Stack } from "@gnoworld/ui";
import { useLocation, useNavigate } from "react-router";
import { gnowebLink } from "../../lib/chain/gnoweb.ts";
import { hostOf, type Failure, type ReadOptions } from "@gnoworld/chain/read";
import { bigLine } from "./RealmCard.tsx";
import type { CallPlace } from "./InlineCard.tsx";
import { RealmBlocks } from "./RealmBlocks.tsx";
import { RealmFacts } from "./RealmFacts.tsx";
import { RealmFunctions } from "./RealmFunctions.tsx";
import { RealmWrites } from "./RealmWrites.tsx";
import styles from "./RealmView.module.css";
import { isHeight, useRealm, type Height, type Realm } from "./useRealm.ts";
import { ListingContext, useRead } from "./useCallable.ts";
import { useRealmFacts } from "./useRealmFacts.ts";

export interface RealmViewProps {
  /** The realm, `gno.land/r/demo/dao`. */
  realm: string;
  /** The universe it is read from. */
  chain: { name: string; chainId: string; rpc: string; gnoweb: string; indexer: string };
  /** Where Back goes when the view was opened by its address, with nowhere in the site behind it. */
  home: string;
  /** lib/chain's options, for a test's fetch. */
  options?: ReadOptions;
}

// Where the page was read: the block's height and time, or why neither is known.
function Read({ height, rpc }: { height: Height | Failure; rpc: string }) {
  if (!isHeight(height)) return <p className={styles["meta"]}>The block height could not be read. {height.next}</p>;
  return (
    <p className={styles["meta"]}>
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

// The realm's facts from the chain's indexer, read on their own: the page does not wait for them, nor do they hide when it fails.
function Facts({ indexer, realm, options }: { indexer: string; realm: string; options: ReadOptions | undefined }) {
  const read = useRealmFacts(indexer, realm, options);
  if (read === undefined) {
    return (
      <div aria-busy="true" aria-label="Reading the facts">
        <Skeleton lines={1} />
      </div>
    );
  }
  return <RealmFacts read={read} />;
}

export function RealmView({ realm, chain, home, options }: RealmViewProps) {
  const origin = chain.gnoweb;
  const link = gnowebLink(origin, realm);
  const state = useRealm({ rpc: chain.rpc, realm, origin }, options);
  const place: CallPlace = { realm, chain, ...(options === undefined ? {} : { options }) };
  const listing = useRead({ rpc: chain.rpc, realm, options });
  const navigate = useNavigate();
  const { key } = useLocation();
  return (
    <ListingContext value={listing}>
      <section aria-labelledby="realm-title">
        <Center gutter="all">
          <Stack space="m">
            <Cluster space="s">
              <Button
                emphasis="quiet"
                onClick={() => {
                  Promise.resolve(key === "default" ? navigate(home) : navigate(-1)).catch((error: unknown) => {
                    reportError(error);
                  });
                }}
              >
                Back
              </Button>
              <Kicker>{chain.name}</Kicker>
            </Cluster>
            <h1 id="realm-title" dir="ltr">
              {realm}
            </h1>
            {link === undefined ? null : (
              <Cluster>
                <Button href={link}>Open it on gnoweb</Button>
              </Cluster>
            )}
            <Body state={state} origin={origin} link={link} call={place} />
            {state.state === "read" ? <Read height={state.height} rpc={chain.rpc} /> : null}
            <RealmFunctions realm={realm} chain={chain} {...(options === undefined ? {} : { options })} />
            <RealmWrites realm={realm} chain={chain} {...(options === undefined ? {} : { options })} />
            <Facts indexer={chain.indexer} realm={realm} options={options} />
          </Stack>
        </Center>
      </section>
    </ListingContext>
  );
}
