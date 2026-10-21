// The overview's parts for the interface's components, each region's content (Overview.tsx).
import { useState } from "react";
import { ActivityChart } from "../ActivityChart/ActivityChart.tsx";
import { Avatar } from "../Avatar/Avatar.tsx";
import { Button } from "../Button/Button.tsx";
import { Card } from "../Card/Card.tsx";
import { Chip } from "../Chip/Chip.tsx";
import { Cluster, Stack } from "../compositions/index.ts";
import { Dialog } from "../Dialog/Dialog.tsx";
import { Field } from "../Field/Field.tsx";
import { Icon } from "../icons/Icon.tsx";
import { LinkProvider, type PageLinkProps } from "../link.tsx";
import { PlanetThumb } from "../PlanetThumb/PlanetThumb.tsx";
import { Menu, Popover } from "../Popover/Popover.tsx";
import { Row } from "../Row/Row.tsx";
import { Stat } from "../Stat/Stat.tsx";
import { Tabs } from "../Tabs/Tabs.tsx";
import { ADDRESS, DAY, disc, short } from "./samples.ts";

export function Chips() {
  const [lens, setLens] = useState("games");
  return (
    <Cluster space="2xs">
      {["games", "dev", "governance"].map((id) => (
        <Chip
          key={id}
          selected={lens === id}
          onClick={() => {
            setLens(id);
          }}
        >
          {id}
        </Chip>
      ))}
      <Chip tone="warm">Live</Chip>
      <Chip tone="signal">Assistant</Chip>
    </Cluster>
  );
}

export function TabRows() {
  const [view, setView] = useState<string | null>("cosmos");
  return (
    <Stack>
      <Tabs
        label="Views"
        tabs={[
          { id: "earth", label: "Earth" },
          { id: "cosmos", label: "Cosmos" },
          { id: "list", label: "List", count: 12 },
        ]}
        selected={view}
        onSelect={setView}
      />
      <Tabs
        label="Library"
        iconOnly
        tabs={[
          { id: "worlds", label: "Worlds", icon: "planet" },
          { id: "people", label: "People", icon: "people" },
        ]}
        selected="worlds"
        onSelect={() => undefined}
      />
    </Stack>
  );
}

export function Popovers() {
  return (
    <Cluster>
      <Popover trigger="Network" label="Choose the network">
        <p>Onyx, the testnet, is where you can sign for free.</p>
      </Popover>
      <Menu
        trigger="More"
        label="Message actions"
        items={[
          { label: "Copy", onSelect: () => undefined },
          { label: "Report", onSelect: () => undefined },
        ]}
      />
    </Cluster>
  );
}

export function Dialogs() {
  const [open, setOpen] = useState(false);
  return (
    <Cluster>
      <Button
        onClick={() => {
          setOpen(true);
        }}
      >
        Open the passport
      </Button>
      <Dialog
        title="Your passport"
        open={open}
        onClose={() => {
          setOpen(false);
        }}
      >
        <p>A stamp for each world you visited: 12 so far.</p>
      </Dialog>
    </Cluster>
  );
}

export function Cards() {
  return (
    <Card>
      <Card.Header icon="chart" kicker="Poll" title="Which realm next?" state="Live" />
      <Card.Body>
        <p>Three answers, 41 votes so far.</p>
      </Card.Body>
      <Card.Actions>
        <Button emphasis="solid">Vote</Button>
      </Card.Actions>
    </Card>
  );
}

export function Rows() {
  return (
    <Stack as="ul" space="3xs">
      <li>
        <Row
          look="divided"
          title="Bubble"
          subtitle="The BUBBLE token"
          activity="214 here now"
          lead={<PlanetThumb src={disc("5cf2c8")} name="Bubble" size="s" decorative />}
          current
        />
      </li>
      <li>
        <Row look="divided" title="Dev help" activity="3 here now" lead={<Icon name="code" />} />
      </li>
    </Stack>
  );
}

export function Fields() {
  return <Field label="Name" prefix="@" help="Letters and digits, 6 at least" value="" onChange={() => undefined} />;
}

export function Stats() {
  return (
    <Cluster space="xl">
      <Stat value={214} caption="Here now" delta={18} hot />
      <Stat value={21480} unit="calls" caption="Today" delta={-120} />
    </Cluster>
  );
}

export function Activity() {
  return <ActivityChart label="Calls per hour, today" values={DAY} />;
}

export function Planets() {
  return (
    <Cluster space="m">
      <PlanetThumb src={disc("5cf2c8")} name="Bubble" />
      <PlanetThumb src={disc("ffc46b")} name="The sun" kind="star" />
      <PlanetThumb src={disc("b79cff")} name="An uncharted signal" kind="signal" magnify />
    </Cluster>
  );
}

export function Avatars() {
  return (
    <Cluster space="m">
      <Avatar address={ADDRESS} name={short(ADDRESS)} size="l" here />
      <Avatar address={ADDRESS} name={short(ADDRESS)} speaking />
      <Avatar address="" name="Jarvis" kind="assistant" />
      <Avatar address="" name="The quiz bot" kind="bot" size="s" />
    </Cluster>
  );
}

// What the app's router hands the slot; here a stand-in that marks what it draws and stays put.
function MarkedLink(props: PageLinkProps) {
  return (
    <a
      data-page-link=""
      {...props}
      onClick={(event) => {
        event.preventDefault();
      }}
    />
  );
}

export function Links() {
  return (
    <LinkProvider link={MarkedLink}>
      <Cluster space="m">
        <Button href="/w/bubble">Fly to Bubble</Button>
        <Row title="Bubble" subtitle="A path from the site's root: the page's own link" href="/w/bubble" />
      </Cluster>
    </LinkProvider>
  );
}
