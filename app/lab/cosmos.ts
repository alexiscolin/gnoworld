// The cosmos as a view (slice 7, 7d2, 7d5 and 7d6), for Alexis's eye on a real GPU: the site's own scene, the worlds from the recorded file
// with the imports read for a sample of them, the view at rest first. The camera keeps the Earth at the centre: a wheel backs away, out to
// the whole cosmos (7d5), and comes back, a drag moves the eye round it. `arrive=<system>` shows that system's arrival instead (7d3), as
// 7g's flights will land on it, with no hero's room and no wheel; `plan` its Plan; `big=<count>` adds a namespace `big` of that many worlds,
// their callers from their own hash, to weigh a system of any size (7v2; Alexis, 2026-11-04: "scalables pour récupérer énormément de
// mondes"); `tier=low` the weak tier.
import { HERO_ZONE, HOME } from "@gnoworld/core";
import { Scene, type Camera, type Object3D, type WebGLRenderer } from "three";
import { CREDITS } from "../src/scene/planet/credits.ts";
import { Web } from "../src/scene/cosmos/web.ts";
import { startScene } from "../src/scene/scene.ts";
import read from "./imports.json" with { type: "json" };
import { linked } from "./linked.ts";
import { paletteNamed } from "./palettes.ts";
import { frameCost } from "./probes.ts";
import { tuningPanel } from "./panel.ts";
import recorded from "./worlds.json" with { type: "json" };

const ZOOM = 0.0022;
// A realm of the synthetic namespace: no deployer, function, import or call known.
const BLANK = { deployer: null, deployerName: null, functions: [], imports: [], calls: null, lastHeight: null };
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

// What a frame of the site's scene costs, for the frame budget's measure: the renderer, stage and camera of its last frame, which three
// hands a stage's onBeforeRender (WebGLRenderer.js:1682), drawn `count` times by the realism page's probe.
const last: { renderer?: WebGLRenderer; stage?: Scene; camera?: Camera } = {};
Scene.prototype.onBeforeRender = (renderer: WebGLRenderer, stage: Object3D, camera: Camera) => {
  if (stage instanceof Scene) Object.assign(last, { renderer, stage, camera });
};
Reflect.set(globalThis, "__labCost", (count: number) => {
  const { renderer, stage, camera } = last;
  if (renderer === undefined || stage === undefined || camera === undefined) return Number.NaN;
  return frameCost(
    renderer,
    () => {
      renderer.render(stage, camera);
    },
    count,
  );
});

const query = new URLSearchParams(location.search);
const remembered = query.get("tier") === "low" ? "low" : undefined;
const scene = startScene({ canvas, remembered, remember: () => undefined, onLost: () => undefined });
const file = linked(recorded, read);
const big = Array.from({ length: Number(query.get("big") ?? 0) }, (_, at) => ({
  id: `big/w${String(at)}`,
  namespace: "big",
  realms: [{ ...BLANK, path: `gno.land/r/big/w${String(at)}`, callers: Math.imul(at + 1, 2654435761) >>> 24 }],
}));
scene.cosmos([...file.worlds, ...big], file.updated);
Reflect.set(globalThis, "__gnoworldScene", scene);
// The whole cosmos's palette (palettes.ts), painted on its mass once its chunk has come.
const palette = new URLSearchParams(location.search).get("palette");
const painting = setInterval(() => {
  const web: unknown = Reflect.get(globalThis, "__gnoworldWeb");
  if (!(web instanceof Web)) return;
  clearInterval(painting);
  web.paint(paletteNamed(palette, document.documentElement));
}, 100);
// A system's name, looked up among the file's systems and nothing else.
const arriving = query.get("arrive");
if (arriving !== null) scene.arrive(arriving);
if (query.has("plan")) scene.see(true);
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
