// Try it (the proposal's card): a quiet box that says where to start, the Read and Write tabs with their counts, each a paged list of rows that
// open in place.
import { Button, Card, Cluster, Stack, Tabs } from "@gnoworld/ui";
import { use, useRef, useState } from "react";
import { CallCountsContext } from "./FunctionRow.tsx";
import { RealmFunctions } from "./RealmFunctions.tsx";
import type { Where } from "./RealmPageCard.tsx";
import { RealmWrites, startHere } from "./RealmWrites.tsx";
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
          Most people start with {start.name} ({start.calls.toLocaleString("en-US")}{" "}
          {start.calls === 1 ? "call" : "calls"}).
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
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"read" | "write">("read");
  const [reads, setReads] = useState(0);
  const [writes, setWrites] = useState(0);
  const [opening, setOpening] = useState<string>();
  const cardRef = useRef<HTMLElement>(null);
  const start = startHere(useCallable(chain.rpc, realm, options), use(CallCountsContext));
  return (
    <section id="functions" aria-label="The realm's functions" ref={cardRef} data-try-open={open ? "" : undefined}>
      <Card look="hub">
        <Card.Header
          title="Try it"
          level={2}
          hint="reads run here without a wallet"
          expand={{
            open,
            onToggle: () => {
              setOpen(!open);
            },
          }}
        />
        {start === undefined ? null : (
          <StartHere
            start={start}
            onStart={() => {
              setTab("write");
              setOpening(start.name);
              cardRef.current?.scrollIntoView({
                behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
                block: "nearest",
              });
            }}
          />
        )}
        <Tabs
          label="Function kind"
          fill
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
        <div role="tabpanel" hidden={tab !== "read"}>
          <Stack space="s">
            <RealmFunctions
              realm={realm}
              chain={chain}
              expanded={open}
              onCount={setReads}
              {...(options === undefined ? {} : { options })}
            />
            <p className={calm["note"]}>No wallet needed: a read runs here and shows its result.</p>
          </Stack>
        </div>
        <div role="tabpanel" hidden={tab !== "write"}>
          <Stack space="s">
            <p className={[calm["box"], "fill-box"].join(" ")}>Every write needs a connected wallet and a signature.</p>
            <RealmWrites
              realm={realm}
              chain={chain}
              options={options}
              expanded={open}
              onCount={setWrites}
              opening={opening}
            />
          </Stack>
        </div>
      </Card>
    </section>
  );
}
