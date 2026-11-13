// The plate, below its title (slice 13, D566): its blocks in their order, each drawn only from what the model holds. The hero (the status and rank
// at the kicker's row, the lede, the actions, the talk bar), the figures band, then the bento of twelve columns: calls per day with who calls it,
// the chat's hours, what only this kind has, what it can do, its page and Try it, around it, the squares; the links out last. The zones are a
// zone step apart (--plate-zone, 48 px, 32 on a narrow plate), the cards in a zone a Stack step. Its code comes after the first screen: the routes
// ask it as a chunk; its entrance is the proposal's score (the blocks' own sheets, and features/universe/arrival.ts for the title).
import { lazy, Suspense } from "react";
import type { RealmRollup } from "@gnoworld/schemas/indexer";
import { Cell, Figures, Grid, Room, Stack } from "@gnoworld/ui";
import { OutLinks } from "../../OutLinks.tsx";
import { Around } from "./Around.tsx";
import { Callers } from "./Callers.tsx";
import { Calls } from "./Calls.tsx";
import { gnowebLink } from "../../lib/chain/gnoweb.ts";
import { Can } from "./Can.tsx";
import { Hero, Pills } from "./Hero.tsx";
import { Hours } from "./Hours.tsx";
import { TokenBlock } from "./TokenBlock.tsx";
import type { PlateModel } from "./model.ts";
import { Widgets } from "./Widgets.tsx";
import styles from "./Plate.module.css";

const FromExplorer = lazy(() => import("../../features/realms/FromExplorer.tsx"));
const RealmView = lazy(() =>
  import("../../features/realms/RealmView.tsx").then((chunk) => ({ default: chunk.RealmView })),
);

// The figures band, and the line that says what the figures cannot.
function Band({ figures, note }: PlateModel["figures"]) {
  return (
    <>
      {figures.length === 0 ? null : <Figures label="Figures" figures={figures} />}
      {note === undefined ? null : <p className="meta">{note}</p>}
    </>
  );
}

// The rollup's calls per function, by name, for Try it's rows.
const counted = (rollup: RealmRollup | undefined) => new Map(rollup?.functions.map(({ name, calls }) => [name, calls]));

// The realm's own cards, in their order: its calls per day beside who calls it, what it can do, its page and Try it.
function RealmCards({ realm, can }: { realm: NonNullable<PlateModel["realm"]>; can: PlateModel["can"] }) {
  const { rollup } = realm;
  const callers = rollup !== undefined && rollup.top.length > 0;
  return (
    <>
      {rollup === undefined ? null : <Calls rollup={rollup} worlds={realm.worlds} beside={callers} />}
      {rollup === undefined || !callers ? null : <Callers rollup={rollup} worlds={realm.worlds} />}
      {can?.some(({ label }) => label === "Token") === true ? <TokenBlock realm={realm.realm} /> : null}
      {can === undefined ? null : (
        <Cell span={12}>
          <Can can={can} link={gnowebLink(realm.chain.gnoweb, realm.realm)} />
        </Cell>
      )}
      <Cell span={12}>
        <Suspense fallback={null}>
          <RealmView realm={realm.realm} chain={realm.chain} state={realm.state} counts={counted(rollup)} />
        </Suspense>
      </Cell>
    </>
  );
}

// What the widgets draw, across the twelve columns: nothing when there are none.
function WidgetCards({ widgets }: Pick<PlateModel, "widgets">) {
  if (widgets.length === 0) return null;
  return (
    <Cell span={12}>
      <Widgets widgets={widgets} />
    </Cell>
  );
}

// What the kind adds between its chart and its cards: nothing when it adds nothing.
function ExtraCards({ extras }: Pick<PlateModel, "extras">) {
  if (extras === undefined) return null;
  return (
    <div className={styles["extras"]}>
      <Stack space="s">{extras}</Stack>
    </div>
  );
}

// The bento of twelve columns. The Earth's and a hub's order (the proposal's s3b.js): the widgets, what the kind adds (Latest on X, Proposals), the
// network, then a hub's realm from the explorer; a realm's: what it adds, its cards, the network, the widgets.
function Cards({ model }: { model: PlateModel }) {
  const { hours, extras, realm, can, around, widgets, explorer } = model;
  const place = realm === undefined;
  return (
    <Grid cols={12} space="s">
      {hours !== undefined && place ? (
        <Cell span={12}>
          <Hours hours={hours} />
        </Cell>
      ) : null}
      {place ? null : <ExtraCards extras={extras} />}
      {place ? null : <RealmCards realm={realm} can={can} />}
      {place ? <WidgetCards widgets={widgets} /> : null}
      {place ? <ExtraCards extras={extras} /> : null}
      {around === undefined ? null : (
        <Cell span={12}>
          <Around around={around} />
        </Cell>
      )}
      {place ? null : <WidgetCards widgets={widgets} />}
      {explorer === undefined ? null : (
        <Cell span={12}>
          <Suspense fallback={null}>
            <FromExplorer {...explorer} />
          </Suspense>
        </Cell>
      )}
    </Grid>
  );
}

export function Plate({ model }: { model: PlateModel }) {
  const { lede, actions, talk, figures, links } = model;
  return (
    <Room key={model.actions.place.path} data-blocks="">
      <Pills lede={lede} />
      <Stack space="zone">
        <Hero lede={lede} actions={actions} talk={talk} />
        <Band {...figures} />
        <Cards model={model} />
        {links === undefined ? null : <OutLinks links={links} />}
      </Stack>
    </Room>
  );
}
