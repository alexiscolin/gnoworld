// A realm's page in its plate (5h, D375, the proposal's "Its page"): the realm's Markdown read once (useRealm), drawn as the allowlisted blocks of
// core's reader in a window of its own, a long one scrolling inside it. Every state names the way out: the link to the realm on gnoweb
// (ADR-0002 §4, gnoweb is the source of truth) stands in its header whatever the page holds, with the height it was read at, the cap's
// state or the failed read's state and its next step.
import { Button, Card, Skeleton, Stack } from "@gnoworld/ui";
import { hostOf, type Failure, type ReadOptions } from "@gnoworld/chain/read";
import { useEffect, useRef, useState } from "react";
import { bigLine } from "./RealmCard.tsx";
import type { CallPlace } from "./InlineCard.tsx";
import { RealmBlocks } from "./RealmBlocks.tsx";
import styles from "./RealmView.module.css";
import { shortPath } from "./shortPath.ts";
import { isHeight, type Height, type Realm } from "./useRealm.ts";

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

// The nearest ancestor that scrolls: where a wheel goes once the page's own window is at its end.
function scrollerOf(from: HTMLElement): HTMLElement | undefined {
  for (let up = from.parentElement; up !== null; up = up.parentElement) {
    if (/auto|scroll/.test(getComputedStyle(up).overflowY)) return up;
  }
  return undefined;
}

// The page's window: whether it has scrolled to its end (its foot fades into the card till then), and a wheel past either end that goes on to
// scroll the plate, so the window never holds the pointer.
function useWindow() {
  const ref = useRef<HTMLDivElement>(null);
  const [end, setEnd] = useState(false);
  useEffect(() => {
    const box = ref.current;
    if (box === null) return undefined;
    const atEnd = () => box.scrollTop + box.clientHeight >= box.scrollHeight - 1;
    const sync = () => {
      setEnd(atEnd());
    };
    const wheel = (event: WheelEvent) => {
      if ((event.deltaY < 0 && box.scrollTop <= 0) || (event.deltaY > 0 && atEnd())) {
        event.preventDefault();
        scrollerOf(box)?.scrollBy({ top: event.deltaY });
      }
    };
    box.addEventListener("scroll", sync);
    box.addEventListener("wheel", wheel, { passive: false });
    const watch = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(sync);
    watch?.observe(box);
    if (box.firstElementChild !== null) watch?.observe(box.firstElementChild);
    return () => {
      box.removeEventListener("scroll", sync);
      box.removeEventListener("wheel", wheel);
      watch?.disconnect();
    };
  }, []);
  return { ref, end };
}

export interface Where {
  realm: string;
  chain: { name: string; chainId: string; rpc: string; gnoweb: string; indexer: string };
  options: ReadOptions | undefined;
}

// Its page: the realm's Render in a window of its own, a long one scrolling inside it; the link to gnoweb stands in the header.
export function PageCard({
  state,
  link,
  place,
  ...where
}: Omit<Where, "options"> & { state: Realm; link: string | undefined; place: CallPlace }) {
  const [open, setOpen] = useState(false);
  const { ref, end } = useWindow();
  const { realm, chain } = where;
  return (
    <section id="page" aria-label="The realm's page">
      <Card look="hub">
        <Card.Header
          title="Its page"
          level={2}
          meta={`${shortPath(realm)} \u00b7 Render()`}
          actions={
            link === undefined ? undefined : (
              <Button href={link} emphasis="solid" size="s" icon="arrow-up-right">
                Open on gnoweb
              </Button>
            )
          }
          expand={{
            open,
            onToggle: () => {
              setOpen(!open);
            },
          }}
        />
        <div
          ref={ref}
          className={styles["window"]}
          data-open={open ? "" : undefined}
          data-end={end ? "" : undefined}
          data-selectable=""
          tabIndex={0}
          role="region"
          aria-label={`Rendered page of ${realm}`}
        >
          <Stack space="xs">
            <Body state={state} origin={chain.gnoweb} link={link} call={place} />
            {state.state === "read" ? <Read height={state.height} rpc={chain.rpc} /> : null}
          </Stack>
        </div>
      </Card>
    </section>
  );
}
