// The cosmos as a view (slice 7, 7d2, 7d5 and 7d6), for Alexis's eye on a real GPU: the site's own scene, the worlds from the recorded file
// with the imports read for a sample of them, the view at rest first. The camera keeps the Earth at the centre: a wheel backs away, out to
// the whole cosmos (7d5), and comes back, a drag moves the eye round it. `arrive=<system>` shows that system's arrival instead (7d3), as
// 7g's flights will land on it, with no hero's room and no wheel.
import { HERO_ZONE, HOME } from "@gnoworld/core";
import { CREDITS } from "../src/scene/planet/credits.ts";
import { startScene } from "../src/scene/scene.ts";
import read from "./imports.json" with { type: "json" };
import { linked } from "./linked.ts";
import { tuningPanel } from "./panel.ts";
import recorded from "./worlds.json" with { type: "json" };

const ZOOM = 0.0022;
// Out to about 1,600 units from what the eye looks at, back along the view's axis so the disc stays in the middle: the whole of the recorded
// cosmos, small there. Rising instead, as the wheel did, slid the disc down out of the frame past a cluster's distance.
const FARTHEST = 45;
const NEAREST = 0.35;
const LEFT = 36;

const canvas = document.querySelector("canvas");
if (canvas === null) throw new Error("no canvas");
canvas.dataset["scene"] = "on";
const footer = document.querySelector("footer");
if (footer !== null) footer.textContent = CREDITS.map((credit) => credit.line).join(" · ");
const panel = document.querySelector("main");
if (panel !== null) panel.hidden = true;

const scene = startScene({ canvas, remembered: undefined, remember: () => undefined, onLost: () => undefined });
const file = linked(recorded, read);
scene.cosmos(file.worlds, file.updated);
Reflect.set(globalThis, "__gnoworldScene", scene);
// A system's name, looked up among the file's systems and nothing else.
const arriving = new URLSearchParams(location.search).get("arrive");
if (arriving !== null) scene.arrive(arriving);
let away = 1;
let aside = 0;
let along = 0;

// The hero's room (core's HERO_ZONE), which holds the home's text: the suns the home dims under its words are dimmed here too, at rest. The
// home never leaves the rest, and the lab shows no text: moved, or at an arrival, it keeps no room, or a world passing it would go (7d9).
const keepHeroRoom = () => {
  const atRest = arriving === null && away === 1 && aside === 0 && along === 0;
  scene.keepClear(
    atRest
      ? { left: 0, top: HERO_ZONE.top * innerHeight, right: HERO_ZONE.right * innerWidth, bottom: innerHeight }
      : undefined,
  );
};
addEventListener("resize", keepHeroRoom);
keepHeroRoom();
// The tuning panel's frame after a change: the hero's room kept as it stands, which asks the scene for one.
tuningPanel(keepHeroRoom);

const go = () => {
  scene.moveTo({ x: HOME.x + aside, y: HOME.y + along, z: HOME.z + (away - 1) * LEFT });
  keepHeroRoom();
};

addEventListener("wheel", ({ deltaY }) => {
  if (arriving !== null) return;
  away = Math.min(FARTHEST, Math.max(NEAREST, away * Math.exp(deltaY * ZOOM)));
  go();
});
addEventListener("pointermove", ({ buttons, movementX, movementY }) => {
  if (buttons === 0 || arriving !== null) return;
  aside -= movementX * 0.06 * away;
  along += movementY * 0.06 * away;
  go();
});
addEventListener("keydown", ({ key }) => {
  if (key === "0" && arriving === null) {
    away = 1;
    aside = 0;
    along = 0;
    go();
  }
});
