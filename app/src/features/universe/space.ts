// The site's door to space (D401): one canvas under every page that shows space, the engine loaded in its own chunk on the first,
// the worlds' file read once; a page says its place and keeps its planet's circle; what the engine asks back (a world, a system,
// the universe) becomes the router's navigation, and its flight's end the page's arrival.
import type { Space } from "../../space/scene.ts";
import type { Place } from "../../space/place.ts";
import { systemPath } from "../../cosmosAt.ts";
import { Heard } from "../../lib/heard.ts";
import { pagesOf } from "../../lib/hubWorld.ts";
import { labelWords } from "./worldFact.ts";
import { site } from "../../places.ts";
import { motionOf } from "../../space/motion.ts";
import { feedMoons, stopMoons } from "./moonRooms.ts";
import { enterPage, landTags } from "./arrival.ts";
import { markDrawn, markFlown, syncFlown } from "./flown.ts";

export { syncFlown };
import { holdsDive, layers, releaseDive } from "./firstLook.ts";
import { attach } from "../../earthGround.ts";
import { circleOf } from "./pageCircle.ts";
import { offerOf } from "./gpu.ts";
import { lightSpace } from "../../lenses.ts";
import { isMap, onMap } from "../../mapView.ts";
import { views } from "./views.ts";
import { exposeSpace } from "./spaceHook.ts";
import { worldsFile } from "./worldsFile.ts";
import styles from "./Universe.module.css";

const loadEngine = () => import("../../space/scene.ts");

let space: Space | undefined;
let [starting, reading, releasing] = [false, false, false];
let asked: Place | undefined;
let navigate: (href: string) => void = () => undefined;
const drawn = { done: false, heard: new Set<() => void>() };

// Each world's page as the rail's links say it (lib/hubWorld.ts): its hub's, else its first realm's view; the Earth's own.
let pages: ReadonlyMap<string, string> = new Map();

const globe = () => document.querySelector<HTMLElement>("[data-globe]");

const events = {
  world: (id: string) => {
    const href = pages.get(id);
    if (href !== undefined) navigate(href);
  },
  system: (id: string) => {
    navigate(systemPath(id));
  },
  universe: () => {
    navigate("/universe");
  },
  near: () => {
    markFlown(false);
    enterPage();
  },
  // A flight that never neared (it stood where it was) still lets the page's text in.
  landed: () => {
    const flying = globe()?.dataset["flown"] === "flying";
    if (flying) markFlown(false);
    if (flying) enterPage();
    landTags();
  },
  drawn: () => {
    drawn.done = true;
    for (const heard of drawn.heard) heard();
    const dive = releaseDive();
    const place = asked;
    if (dive !== undefined && place !== undefined)
      setTimeout(() => {
        go(place);
      }, dive);
  },
};

function start(): void {
  if (starting) return;
  starting = true;
  const { canvas, labels } = layers(styles["canvas"] ?? "");
  // In development a module swapped in takes its canvas and its engine with it: no second universe draws under the new one. A hot reload
  // of an engine file brings this module back without its old instance's dispose (Vite runs the accepting module's alone): that one
  // leaves first, as it starts.
  const leave = () => {
    space?.dispose();
    canvas.remove();
    labels.remove();
  };
  import.meta.hot?.dispose(leave);
  if (import.meta.env.MODE === "development") {
    const before = globalThis as { gnoworldLeaveSpace?: () => void };
    before.gnoworldLeaveSpace?.();
    before.gnoworldLeaveSpace = leave;
  }
  loadEngine()
    .then(({ Space: Engine }) => {
      space = new Engine({
        canvas,
        labels,
        base: import.meta.env.BASE_URL,
        events,
        still: () => motionOf().matches,
        ...labelWords,
      });
      canvas.dataset["scene"] = "on";
      attach(space);
      // The journeys and the workshop read the engine's state (a production build holds no trace of it).
      exposeSpace(space);
      // The Map (D433): space from above at every level, flown to and from as it is picked; a place asked later is reached the same.
      space.view(isMap());
      import.meta.hot?.dispose(
        onMap(() => {
          space?.view(isMap());
        }),
      );
      // A tag's light (D425), as it is picked and as who is here changes; the engine eases it.
      // Wired in every build: in `hot?.dispose(lightSpace(…))` a build with no hot module would never call lightSpace.
      const unlit = lightSpace(space);
      import.meta.hot?.dispose(unlit);
      if (asked !== undefined) go(asked);
      readWorlds();
    })
    .catch(() => {
      // The engine's chunk did not come, or WebGL was refused: the pages stand without space, and say so (ViewInSpace.tsx).
      canvas.remove();
      labels.remove();
      tellOffer("failed");
    });
}

// The worlds' file, for the engine and its links: read once space runs, and again on the next place asked if that read failed.
function readWorlds(): void {
  if (reading || space?.universe !== undefined) return;
  reading = true;
  worldsFile()
    .then((file) => {
      const worlds = file?.worlds ?? [];
      const home = site.universeAt("/");
      pages = pagesOf(worlds, { earth: home.earth.path, worlds: home.worlds });
      space?.worlds(worlds);
      // The first visit's dive to the home starts here, the file come: its Earth's tag waits for it to near (D459).
      if (asked?.kind === "home" && flying()) markFlown(true);
      if (asked !== undefined) tell(asked);
    })
    .catch(reportError)
    .finally(() => {
      reading = false;
    });
}

function go(place: Place): void {
  if (space === undefined) return;
  space.covered = false;
  readWorlds();
  if (holdsDive(place)) return;
  markDrawn(place);
  // A flight to a page's planet hides the page till it nears; a jump there tells it at once, as an unchanged place lets it be.
  const went = space.go(place);
  if (went && (place.kind === "world" || place.kind === "home")) markFlown(true);
  tell(place);
}

// The GUI's word of where space is: the system it rests at and how many worlds that holds, none far out.
function tell(place: Place): void {
  feedMoons(space, place);
  const system = place.kind === "system" ? place.id : undefined;
  const worlds = system === undefined ? 0 : (space?.universe?.bySystem.get(system)?.planets.length ?? 0);
  views.set({ system, worlds });
}

/** The page that showed space goes: its planet's circle with it, so no plate stays drawn under what comes next (an error, the full
 * chat, a page with none). */
export function release(): void {
  releasing = true;
  // Once the commit is done, and unless a page asked a place in it (the next page, or React's strict second run of the same): none draws
  // under a page that shows none.
  queueMicrotask(() => {
    if (!releasing || space === undefined) return;
    releasing = false;
    // Covered first: the circle's going turns the framing, and a framing that turns in sight flies, to a flight no page waits on.
    space.covered = true;
    space.hold(undefined);
    stopMoons();
  });
}

/** Shows space at `place` under the page, or covers it with none; `to` is the router's navigation. On a device that waits to be asked,
 * space starts once the reader presses "View in space" (`press`). */
export function show(place: Place | undefined, to: (href: string) => void): void {
  navigate = to;
  asked = place;
  releasing = false;
  if (place === undefined) {
    if (space !== undefined) space.covered = true;
    return;
  }
  if (offer.state === "undecided") {
    const said = offerOf();
    tellOffer(said === "auto" ? "taken" : said);
  }
  if (offer.state !== "taken") return;
  start();
  go(place);
}

/** "View in space": the reader asks for space where the device waits to be asked. */
export function press(): void {
  if (offer.state !== "ask") return;
  tellOffer("taken");
  start();
  if (asked !== undefined) go(asked);
}

/** Where the offer of space stands: not decided yet, taken (space runs or loads), waiting for the reader's ask, never (a weak GPU), or
 * failed (its chunk or WebGL refused). */
export const offer = {
  state: "undecided" as "undecided" | "taken" | "ask" | "none" | "failed",
  heard: new Heard(),
};
function tellOffer(state: typeof offer.state): void {
  offer.state = state;
  offer.heard.tell();
}

/** The page's planet's circle and its plate, measured as the page lays them out. */
export function hold(): void {
  if (space === undefined) return;
  space.hold(circleOf(globe()));
  const plate = document.querySelector("[data-look='plate']")?.getBoundingClientRect();
  const content = document.querySelector<HTMLElement>("[data-look='plate'] [data-content]");
  // Where the words end: the content's right edge less its end padding (--plate-inset-end), where the fill starts to fade; its box alone reaches the plate's edge.
  const words =
    content === null
      ? undefined
      : content.getBoundingClientRect().right - parseFloat(getComputedStyle(content).paddingInlineEnd);
  if (plate !== undefined) space.plate(plate, words ?? plate.right);
}

/** Whether space has drawn its first frame. */
export const drawnYet = (): boolean => drawn.done;

/** Calls `heard` once the first frame is drawn (at once if it was). */
export function onDrawn(heard: () => void): () => void {
  if (drawn.done) heard();
  drawn.heard.add(heard);
  return () => drawn.heard.delete(heard);
}

/** Whether a flight brings the page's planet now. */
export const warmWorld = (id: string): void => space?.stage.near?.warm.planet(space.universe?.byId.get(id), true);
export const flying = (): boolean => space?.rig.flying === true;
