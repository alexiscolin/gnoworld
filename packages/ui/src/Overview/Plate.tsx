// The overview's parts for the realm plate's generic pieces (Overview.tsx).
import { useState } from "react";
import { DayChart } from "../ActivityChart/DayChart.tsx";
import { Card } from "../Card/Card.tsx";
import { Activity } from "./Activity.tsx";
import { Cell, Cluster, Grid, Stack } from "../compositions/index.ts";
import { Figures } from "../Figures/Figures.tsx";
import { Network, type NetworkNode } from "../Network/Network.tsx";
import { Disclosure } from "../Disclosure/Disclosure.tsx";
import { PagedList } from "../PagedList/PagedList.tsx";
import { Region, Stage } from "./Region.tsx";
import { Tabs } from "../Tabs/Tabs.tsx";
import { DAY, FIGURES } from "./samples.ts";

// 120 days of calls: the day's shape, stretched, with a few quiet days.
const DAYS = Array.from({ length: 120 }, (_, i) => (i % 17 === 0 ? 0 : (DAY[i % DAY.length] ?? 0) * (1 + (i % 5))));

function Days() {
  const [scale, setScale] = useState<"log" | "linear">("log");
  return (
    <Stack>
      <Tabs
        label="Scale"
        size="s"
        tabs={[
          { id: "log", label: "Log" },
          { id: "linear", label: "Linear" },
        ]}
        selected={scale}
        onSelect={(id) => {
          setScale(id === "linear" ? "linear" : "log");
        }}
      />
      <DayChart label="Calls per day, the last 120 days" values={DAYS} scale={scale} />
    </Stack>
  );
}

const NAMES = Array.from({ length: 40 }, (_, i) => `r/demo/realm${String(i + 1)}`);

function Paged() {
  return (
    <PagedList
      label="callers"
      items={NAMES}
      keyOf={(name) => name}
      textOf={(name) => name}
      render={(name) => (
        <Disclosure title={name} trail={<time>3 min ago</time>}>
          <p>What it holds.</p>
        </Disclosure>
      )}
      sorts={[
        { id: "az", label: "A to Z", compare: (a, b) => a.localeCompare(b) },
        { id: "za", label: "Z to A", compare: (a, b) => b.localeCompare(a) },
      ]}
    />
  );
}

const LINKED: NetworkNode[] = Array.from({ length: 9 }, (_, i) => ({
  id: `n${String(i)}`,
  label: `pkg${String(i)}`,
  kind: i % 3 === 0 ? "pure" : "realm",
}));

function Networks() {
  const [picked, setPicked] = useState<string | undefined>("n1");
  return (
    <Network
      label="Linked packages"
      centre={{ id: "c", label: "this realm" }}
      left={{ word: "imports", nodes: LINKED.slice(0, 5) }}
      right={{ word: "imported by", nodes: LINKED.slice(5), total: 12 }}
      selected={picked}
      onSelect={setPicked}
    />
  );
}

function Band() {
  return (
    <Stage>
      <Figures label="Figures band" figures={FIGURES} />
    </Stage>
  );
}

function HubCards() {
  const [open, setOpen] = useState(false);
  return (
    <Grid cols={12} space="s">
      <Cell span={8} narrow={6}>
        <Card look="hub">
          <Card.Header
            title="Who calls it"
            expand={{
              open,
              onToggle: () => {
                setOpen(!open);
              },
            }}
          />
          <Card.Body>
            <p>{open ? "Every caller, with its count." : "The five that call it most."}</p>
          </Card.Body>
        </Card>
      </Cell>
      <Cell span={4} narrow={6}>
        <Card look="hub" dashed>
          <Card.Header title="What it can do" />
          <Cluster>
            <p>No data yet.</p>
          </Cluster>
        </Card>
      </Cell>
    </Grid>
  );
}

/** The plate's generic pieces, each in its region. */
export function PlateRegions() {
  return (
    <>
      <Region name="Activity">
        <Activity />
      </Region>
      <Region name="Day chart">
        <Days />
      </Region>
      <Region name="Paged list">
        <Paged />
      </Region>
      <Region name="Network">
        <Networks />
      </Region>
      <Region name="Figures">
        <Band />
      </Region>
      <Region name="Hub cards">
        <HubCards />
      </Region>
    </>
  );
}
