// The cosmos as a view (slice 7, 7d2), for Alexis's eye on a real GPU: the site's own scene, the worlds from the recorded file, a wheel to
// leave and come back, a drag to go along the disc, as flights will once they land.
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
  const out = (away - 1) * LEFT;
  scene.moveTo({ x: HOME.x + aside, y: HOME.y + 0.86 * out + along * 0.86, z: HOME.z + 0.5 * out + along * 0.5 });
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
