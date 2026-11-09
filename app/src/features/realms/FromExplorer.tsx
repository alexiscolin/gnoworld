// A world's realm card (8g, frame 93): "REALM · FROM THE EXPLORER", its path, who deployed it and since which block, as the public indexer
// read its deploy (F4875), and the block of its last call as the worlds' file holds it (its calls are the plate's figure), with the read's source and time; then "EXPLORER ↗" and "DOCS ↗".
// A fact the indexer or the file did not give is left out, never a zero.
import { shortAddress } from "@gnoworld/schemas";
import type { Worlds } from "@gnoworld/schemas/indexer";
import { Card, Grid, Stack } from "@gnoworld/ui";
import { DOCS, explorerLink } from "../../lib/chain/explorer.ts";
import { realmAt, type RealmAt } from "../../realmAt.ts";
import { ReadSource } from "./ReadSource.tsx";
import { useRealmFacts } from "./useRealmFacts.ts";
import { OutLinks } from "./OutLinks.tsx";

const grouped = (n: number): string => n.toLocaleString("en-US");

function Fact({ label, children }: { label: string; children: string }) {
  return (
    <dl>
      <dt className="label">{label}</dt>
      <dd dir="ltr">{children}</dd>
    </dl>
  );
}

type Held = Worlds["worlds"][number]["realms"][number];

// The card's three facts, each left out when no source gave it: the deployer by the name the file holds, else its short address.
function Facts({
  deployer,
  held,
  firstBlock,
}: {
  deployer: string | undefined;
  held: Held | undefined;
  firstBlock: number | undefined;
}) {
  const last = held?.lastHeight ?? null;
  return (
    <Grid min="s" space="s">
      {deployer === undefined ? null : <Fact label="Deployed by">{held?.deployerName ?? shortAddress(deployer)}</Fact>}
      {firstBlock === undefined ? null : <Fact label="Since block">{grouped(firstBlock)}</Fact>}
      {last === null ? null : <Fact label="Last call at block">{grouped(last)}</Fact>}
    </Grid>
  );
}

export interface FromExplorerProps {
  /** The realm's view on this site, `/r/gov/dao` or `/net/<id>/r/...`. */
  view: string;
  worlds: Worlds["worlds"] | undefined;
}

function RealmCard({ found, worlds }: { found: RealmAt; worlds: Worlds["worlds"] | undefined }) {
  const { realm, chain } = found;
  const read = useRealmFacts(chain.indexer, realm);
  const held = worlds?.flatMap((world) => world.realms).find((each) => each.path === realm);
  const facts = read?.ok === true ? read.value : {};
  return (
    <Stack space="m">
      <Card compact>
        <Card.Header title={realm} kicker="Realm · from the explorer" level={2} />
        <Card.Body>
          <Facts deployer={facts.deployer ?? held?.deployer ?? undefined} held={held} firstBlock={facts.firstBlock} />
          {/* A read that failed says nothing here: the page's one error line is the Render card's (D534). */}
          {read?.ok === true ? <ReadSource source={read.source} /> : null}
        </Card.Body>
      </Card>
      <OutLinks
        links={[
          { label: "Explorer", href: explorerLink(chain.chainId, realm) },
          { label: "Docs", href: DOCS },
        ]}
      />
    </Stack>
  );
}

export default function FromExplorer({ view, worlds }: FromExplorerProps) {
  const found = realmAt(view);
  return found === undefined ? null : <RealmCard found={found} worlds={worlds} />;
}
