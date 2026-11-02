// The cosmos as a view (slice 7, 7d2 and 7d6), for Alexis's eye on a real GPU: the site's own scene, the worlds from the recorded file, the
// view at rest first. The camera keeps the Earth at the centre: a wheel backs away and comes back, a drag moves the eye round it.
import { Worlds } from "@gnoworld/schemas/indexer";
import { HOME } from "@gnoworld/core";
import { CREDITS } from "../src/scene/planet/credits.ts";
import { startScene } from "../src/scene/scene.ts";
import recorded from "./worlds.json" with { type: "json" };

const ZOOM = 0.0016;
const FARTHEST = 7;
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
scene.cosmos(Worlds.parse(recorded).worlds);
Reflect.set(globalThis, "__gnoworldScene", scene);

let away = 1;
let aside = 0;
let along = 0;

const go = () => {
  scene.moveTo({ x: HOME.x + aside, y: HOME.y + along, z: HOME.z + (away - 1) * LEFT });
};

addEventListener("wheel", ({ deltaY }) => {
  away = Math.min(FARTHEST, Math.max(NEAREST, away * Math.exp(deltaY * ZOOM)));
  go();
});
addEventListener("pointermove", ({ buttons, movementX, movementY }) => {
  if (buttons === 0) return;
  aside -= movementX * 0.06 * away;
  along += movementY * 0.06 * away;
  go();
});
addEventListener("keydown", ({ key }) => {
  if (key === "0") {
    away = 1;
    aside = 0;
    along = 0;
    go();
  }
});
