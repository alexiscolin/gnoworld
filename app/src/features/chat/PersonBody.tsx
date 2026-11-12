// What a person's card holds under its title for an account, as the passport holds its own: the figures and the tabs on one row, one panel
// under it. The row and the cards' places are drawn at once, a figure or a card not yet read a skeleton, so nothing moves as the read comes;
// only the cards' chunk (PersonBlocks) is asked later. A failed read is one inline line.
import type { PersonCardData } from "@gnoworld/schemas/indexer";
import { Cluster, Skeleton, Stack, Stat, Tabs } from "@gnoworld/ui";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";
import { queryClient } from "../../lib/query/client.ts";
import { PendingCard, PendingFigure, TabRow } from "../../TabRow.tsx";
import { ErrorView, useWhere } from "../errors/index.ts";
import { wholeGnot } from "./personData.ts";
import { personOptions } from "./personQueries.ts";
import appear from "../../enter.module.css";
import type { PersonTab } from "./PersonBlocks.tsx";

const PersonBlocks = lazy(() => import("./PersonBlocks.tsx"));

// The cards each tab holds: the places drawn while they are read.
const CARDS: Record<PersonTab, ("chart" | "list")[]> = {
  activity: ["chart", "list"],
  worlds: ["list"],
  tokens: ["list"],
};

// A figure not yet read, as the passport draws one.
function Pending() {
  return (
    <PendingFigure>
      <Stack space="2xs">
        <Skeleton />
        <Skeleton />
      </Stack>
    </PendingFigure>
  );
}

// The balance, the calls and the realms called, each with its caption whole.
function Figures({ data }: { data: PersonCardData | undefined }) {
  if (data === undefined)
    return (
      <Cluster space="s" align="end">
        <Pending />
        <Pending />
        <Pending />
      </Cluster>
    );
  const { balance, calls } = data;
  return (
    <Cluster space="s" align="end">
      {balance.state === "none" ? null : balance.state === "ok" ? (
        <Stat size="s" value={wholeGnot(balance.ugnot)} unit="GNOT" caption="balance" />
      ) : (
        <p className="label">Balance unavailable</p>
      )}
      <Stat size="s" value={calls?.total ?? 0} caption="calls" />
      <Stat size="s" value={calls?.realms ?? 0} caption="realms called" />
    </Cluster>
  );
}

function Places({ tab }: { tab: PersonTab }) {
  return (
    <Stack space="m">
      {CARDS[tab].map((like) => (
        <PendingCard key={like} like={like}>
          <Skeleton shape="card" />
        </PendingCard>
      ))}
    </Stack>
  );
}

export function PersonBody({ address }: { address: string }) {
  const where = useWhere();
  const [tab, setTab] = useState<PersonTab>("activity");
  const { data, isError, refetch, dataUpdatedAt } = useQuery(personOptions(address), queryClient);
  if (isError)
    return (
      <ErrorView
        kind="unavailable"
        size="inline"
        where={where}
        onRetry={() => {
          refetch().catch(reportError);
        }}
      />
    );
  return (
    <Stack space="m">
      <TabRow
        figures={<Figures data={data} />}
        tabs={
          <Tabs
            label="Person"
            size="s"
            selected={tab}
            onSelect={(id) => {
              setTab(id === "worlds" || id === "tokens" ? id : "activity");
            }}
            tabs={[
              { id: "activity", label: "Activity" },
              { id: "worlds", label: "Worlds" },
              { id: "tokens", label: "Tokens" },
            ]}
          />
        }
      />
      <div role="tabpanel" key={tab} className={appear["enter"]}>
        {data === undefined ? (
          <Places tab={tab} />
        ) : (
          <Suspense fallback={<Places tab={tab} />}>
            <PersonBlocks tab={tab} data={data} address={address} now={dataUpdatedAt} />
          </Suspense>
        )}
      </div>
    </Stack>
  );
}
