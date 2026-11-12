// Try it (the proposal's card): a quiet box that says where to start, the Read and Write tabs with their counts, each a paged list of rows that
// open in place.
import { Button, Card, Cluster, grouped, Stack, Tabs, useAlone } from "@gnoworld/ui";
import { use, useRef, useState } from "react";
import { callsIn } from "../calls/index.ts";
import { useApp } from "../../storeContext.tsx";
import { CallCountsContext } from "./FunctionRow.tsx";
import { RealmFunctions } from "./RealmFunctions.tsx";
import type { Where } from "./RealmPageCard.tsx";
import { RealmWrites, startHere } from "./RealmWrites.tsx";
import appear from "../../enter.module.css";
import calm from "./quiet.module.css";
import { useCallable } from "./useCallable.ts";

// Try it: a quiet box that says where to start, the Read and Write tabs with their counts, each a paged list of rows that open in place.
// Where to start: the function most called, and the button that opens its call card.
function StartHere({ start, onStart }: { start: { name: string; calls: number }; onStart: () => void }) {
  return (
    <div className={[calm["box"], "fill-box"].join(" ")}>
      <Stack space="2xs">
        <b>Start here</b>
        <span>
          Most people start with {start.name} ({grouped(start.calls)} {start.calls === 1 ? "call" : "calls"}).
        </span>
        <Cluster space="2xs">
          <Button emphasis="solid" size="s" icon="play" onClick={onStart}>
            Call {start.name}
          </Button>
        </Cluster>
      </Stack>
    </div>
  );
}

export function TryCard({ realm, chain, options }: Where) {
  const expand = useAlone("try");
  const { open } = expand;
  const [tab, setTab] = useState<"read" | "write">("read");
  const [reads, setReads] = useState(0);
  const [writes, setWrites] = useState(0);
  const [opening, setOpening] = useState<{ name: string; n: number }>();
  const cardRef = useRef<HTMLElement>(null);
  // A call card open in it keeps its surface under the pointer: lighter, its muted labels fall under 4.5:1.
  const prefix = `${chain.chainId} ${realm}.`;
  const holding = useApp((state) => Object.keys(callsIn(state)?.calls ?? {}).some((id) => id.startsWith(prefix)));
  const start = startHere(useCallable(chain.rpc, realm, options), use(CallCountsContext));
  return (
    <section id="functions" aria-label="The realm's functions" ref={cardRef} data-try-open={open ? "" : undefined}>
      <Card look="hub" rises open={open} fixed={holding}>
        <Card.Header
          icon="play"
          title="Try it"
          level={2}
          actions={
            // The card's own switch stands in its header, as Calls per day's scale does: the title first, then what it shows
            // (Alexis, 2026-11-10: "mauvaise hiérarchie avec le système d'onglets en dessous").
            <Tabs
              label="Function kind"
              size="xs"
              plainCount
              tabs={[
                { id: "read", label: "Read", count: reads },
                { id: "write", label: "Write", count: writes },
              ]}
              selected={tab}
              onSelect={(id) => {
                setTab(id === "write" ? "write" : "read");
              }}
            />
          }
          expand={expand}
        />
        {start === undefined ? null : (
          <StartHere
            start={start}
            onStart={() => {
              setTab("write");
              setOpening({ name: start.name, n: (opening?.n ?? 0) + 1 });
              cardRef.current?.scrollIntoView({
                behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
                block: "nearest",
              });
            }}
          />
        )}
        <div role="tabpanel" className={appear["enter"]} hidden={tab !== "read"}>
          <Stack space="s">
            <RealmFunctions
              realm={realm}
              chain={chain}
              expanded={expand.rows}
              onCount={setReads}
              {...(options === undefined ? {} : { options })}
            />
            <p className={calm["note"]}>No wallet needed: a read runs here and shows its result.</p>
          </Stack>
        </div>
        <div role="tabpanel" className={appear["enter"]} hidden={tab !== "write"}>
          <Stack space="s">
            <p className={[calm["box"], "fill-box"].join(" ")}>Every write needs a connected wallet and a signature.</p>
            <RealmWrites
              realm={realm}
              chain={chain}
              options={options}
              expanded={expand.rows}
              onCount={setWrites}
              opening={opening}
              onShut={() => {
                setOpening(undefined);
              }}
            />
          </Stack>
        </div>
      </Card>
    </section>
  );
}
