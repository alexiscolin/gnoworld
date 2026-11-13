# The dive, rebuilt (D401, D402)

Alexis, 2026-11-08: the dive "ne marche pas du tout de manière propre", to rebuild from scratch to the video, after the demo he
validated ("ok parfait, implémente cela comme tel"; "tous les éléments d'animation de la démo en entier"; "perf et intégration au
top"; our own components and styles). The demo: https://claude.ai/artifact/2PySNFdmxfrdadoRmgbMqQ (its source is the reference for
every value below). Ping-pong mode: no tests while it builds; they come once Alexis validates it live, before `main`.

## What is wrong today (the map of 2026-11-08)

Three sets of objects swapped, not one scene: the cosmos (`scene/cosmos`), a page's planet (`scene/world/view.ts`) and the page's
Earth (`scene/earth/view.ts`, a second Earth beside `cosmos/home.ts`'s). A page's body sits in camera space, the cosmos hides behind
it (`scene.cosmos(undefined)`), and a flight hands one over to the other (`flight/chase.ts`, `approach.ts`, `way.ts`, the veil).
The eye is moved by five writers that add up: the rest view's offset, a flight's `travel`, the hand-over's glide, the dive's offset,
the drag and the zoom (`eye.ts`, `cosmos/restEye.ts`, `restHand.ts`, `dive.ts`, `orbit.ts`, `zoom.ts`).

## The design

- **One pose.** Everything the camera does is one pose on the stage, in doubles: what it looks at, how far, from which way, its up,
  its field of view, and how far the lens shifts to the page's circle. Every view the code already knows (the far view, a system's
  arrival, the view at rest, the Plan) gives a pose; a page's body gives one (its place in the cosmos, at the distance that fills
  the page's circle, the sun on its right).
- **One move.** A flight goes from the pose it has to the pose asked along van Wijk and Nuij's path (core, pure): straight, at a
  speed that looks steady, rising only when the two are far apart; what it goes to never drifts off and comes back. 1.15 s +
  0.42 s per unit of the path, from 1.3 to 3.4 s; power2.inOut from rest, power2.out when already moving; the field of view opens
  by 5° mid-way; the up and the way turn by a slerp. A new ask mid-flight starts from where the camera is.
- **One scene.** The page's body is the cosmos's body, stood where the cosmos has it, at its size: nothing is hidden and shown
  again. The cosmos stays drawn on every page; on a page it dims (suns 0.45, dust 0.15, stars 0.5).
- **Free navigation.** Drag turns round what is looked at, with inertia (0.32 s); the wheel zooms to the pointer, with inertia
  (0.18 s); a wheel in over a body or a system dives to it; a wheel out on a page goes up a level; zooming out of a system is the
  universe, into one is that system; a slow turn after 4 s still (none under reduced motion).
- **Arriving.** At 68 % of the way the page's text enters (GSAP, our components untouched in look): the title rises from 40 %
  below, power4.out 1.1 s; the rest by 0.05 s, power3.out 0.7 s from 18 px; figures count up 0.9 s; activity bars grow 0.6 s
  by 0.01 s; the chat slides in 28 px, 0.8 s; the planet slides into the page's circle by the lens shift, sine.inOut 1.7 s. Leaving
  plays it back 2.6 times faster. On landing a glare sweeps the planet pole to pole (2.4 s) and leaves its grid (0.35).
- **Speed.** A radial blur only while the camera moves fast (none at rest, no pass then); the speed dust only in a flight.
- **No flight panel** (D402).

## The order

1. Core: the path and the pose maths, pure.
2. The scene: the pose and the flight replace the eye's writers; the dive at home is a flight from the far view.
3. A page's body in the cosmos, the lens shift by the pose; the cosmos kept on pages.
4. Free navigation.
5. The pages' text: GSAP timelines in place of the keyframes and the ghost.
6. The effects: blur, speed dust, the scan, the dimming, the rail's and the level card's entrances.
7. Delete what is replaced; budgets to the measured weights (D386); lint, types, build.
8. Once Alexis validates: the tests (the path's properties, the levels, the timings), the journeys (fly, open a realm), review.

## Where it stands (2026-11-08)

Done, types and lint clean on the product code, every module compiled by the workshop's dev server:
- core `frame/zoomPath.ts` (+ its test, 26 green): the path, `glideAt`, `zoomSeconds`.
- `scene/rig/`: `pose.ts`, `flight.ts` (one move, near at 68 %), `free.ts` (drag and wheel with inertia, slow turn), `rig.ts` (pose,
  flight, hand, lens shift, aim, wheel anchor), `flights.ts` (star, rest, cosmos, body; the level follows the zoom), `keys.ts`,
  `aim.ts`, `goal.ts` (the types), `page.ts` (a page's circle and hold).
- `eye.ts` is the rig's holder; `cosmos/atRest.ts` dives by one rig flight from the far view; `restEye.ts`/`resting.ts` turn each view
  into a goal; `cosmos/hidden.ts` hides the cosmos's body a page's own stands in for; the cosmos stays drawn on every page
  (`host.ts`); a page opened directly stands at its body (`flown.ts`); `lens.ts` no longer shifts the lens (the rig does).
- Deleted: `scene/flight/*`, `orbit.ts`, `zoom.ts`, `cosmos/dive.ts`, `cosmos/restHand.ts`, `dissolve.ts`, `FlightPanel` (D402).

Then (same day): `rig/speed.ts` (radial blur only while fast, GPU-wrapped speed dust), `rig/scan.ts` (glare and grid shell on
landing), `rig/effects.ts` and `rig/page.ts` (one frame of the camera and its effects), `cosmos/hidden.ts` dims the cosmos to 0.45
behind a page and hides its labels; `features/universe/arrival.ts` (GSAP, D403): the plate's fill, title, items, bars, dock, played
at the flight's 68 % (`markFlown`) or at once on a page opened directly (`useSpace`), and played back 2.6 times as fast on the
leaving page's ghost (`rise.ts`); the hero's and the rail's rises in GSAP; ui's `Stat` counts 0.9 s, power3.out; ui's `Panel` lost
its CSS keyframes (the GSAP hook `--plate-in`); the canvas's plate fill (`earth/ground.ts`) comes in over 1.1 s, sine.out.

Left: Alexis's look in the workshop; the final pass (the Earth, worlds, systems, zooming out to every system, frame rates, loading);
the tests the old code's leave red (`scene.test.ts`, `cosmos.test.ts`, `resting.test.ts`, `eye.test.ts`, `watch.test.ts`,
`rise.test.ts`, `flown` and `worldsFeed` tests; `flights.test.ts` went with its code); budgets (`chunks.ts`) to the measured weights.

## Change of course (2026-11-08, after Alexis's look)

Grafting the rig onto the old cosmos failed, by Alexis's captures and ours: the old cosmos draws composed views (postcards, the
ladder) that stand worlds as bodies or points by the view, at exaggerated sizes, so worlds pop in and out, a neighbour fills the
screen over a page's planet, and a click lands on a composed view, not on what was clicked; and a page's planet no longer turned
under a drag. Alexis: "ça n'a rien à voir avec la démo", "les mondes apparaissent et disparaissent", "on ne peut plus rotater les
mondes", "quand on clique à un endroit on zoome à un autre".

So the cosmos is drawn as the demo draws it, from the worlds' file: every namespace a system (a sun on its own tilted plane), every
realm a planet on its orbit, in one instanced draw of ray-traced spheres never under 2.4 px (a dot far out, a sphere near), the
suns one additive draw, each system's dust one point draw, the Earth in its own system at home; nothing appears or disappears by
the view. A click or a wheel aims at what is under the pointer; a flight's goal is that object's real place. Kept: the rig (pose,
flight, free hand, lens shift), the GSAP arrival, speed and scan, the sky, the page's planet (drawn where the cosmos's stands, the
cosmos's hidden), the HTML labels' look. Replaced: `scene/cosmos/*`'s Cosmos (disc, bodies, ladder, rest views, web, nebulae,
home) as the cosmos's drawing. A drag on a page turns round the planet, which keeps its turn (the steady quaternion).

## From scratch (Alexis, 2026-11-08, 13:00): the demo itself, everything spatial replaced

Alexis: "je veux ta démo, refais tout au propre, supprime et efface, je me fous des anciens tests ou barrières"; "tout ce qui est
spatial peut disparaître sauf la GUI 2D"; "on refait tout au propre avec ces effets"; "il faut que ce soit smooth comme la démo".
Backup of the whole tree before it: `git stash list`, "backup: the pingpong tree before the space's rebuild from scratch".

- **Delete**: `app/src/scene/` whole (old engine, its tests), `app/lab/` (its realism lab), the spatial parts of
  `features/universe` (labelDoors, EarthSigns, WorldMoons, globe painting, worldsFeed's scene parts, gpu probe tied to the old
  scene), the scene's chunk budgets and journeys that measure it. Keep the 2D GUI: header, ViewSwitch, hero, rail, SystemCrumb,
  the pages' panels and chat (ui's Panel, PlaceFrame, Dock), SpaceLoader (fed by the new engine's `data-ready`/`data-dive`).
- **New engine** `app/src/space/`, a port of the demo's script (`.../scratchpad/dive/index.html`, the artifact
  https://claude.ai/artifact/2PySNFdmxfrdadoRmgbMqQ) to typed modules under 200 lines, nothing made on a frame:
  - `layout` (core, pure, seeded by ids): the worlds' file → systems (one per namespace, a sun on its own tilted plane, placed in a
    disc, the liveliest nearest home) and planets (one per world, on its orbit); the Earth in the home system, fixed.
  - `planets` (one instanced draw of ray-traced spheres, never under 2.4 px, orbits on the GPU, the focused one's scan), `suns`
    (one additive draw), `dust`, `stars`, `orbits` (the current system's), `plate` (the page's plate fill drawn behind the planet,
    from `[data-look='plate']`'s box), `speed` (blur only while fast, speed dust), `labels` (pooled HTML pills), `pick`.
  - The rig (`scene/rig/{pose,flight,free,rig}.ts`, moved as they are): one pose, van Wijk's path (core `zoomPath`), the hand.
  - `space.ts`: one WebGLRenderer, one rAF loop (stops when hidden or covered), `go(place)`, `circle(box)`, `cover`, events
    `near`/`landed`/`level`/`enter`; a click or a wheel on a planet asks `enter(world)` (the page navigates), on a system `level`.
- **Bridge** `features/universe`: `useSpace` and `host` shrink to: show space, `go` the page's place, hand the page's circle,
  play `arrival.ts` at `near`. The URL stays the place.
- Then: types, lint, build, the captures through `.../scratchpad/shoot.mjs` (headless Chromium `--single-process`, a test-GPU dev
  server on 5185 with the workshop's data), a loop of fixes till it is the demo, then Alexis's look.
- **The planets as generated today** (Alexis, 13:05: "avec les vraies planètes comme générées actuellement, en termes de réalisme,
  leur forme et leur génération en art génératif"): `scene/planet/` (the generated worlds' shaders and maps, `createWorld`,
  `worldOf`, `mapNamesOf`, `loadMap`) moves to `app/src/space/planet/` unchanged; far out a world is the instanced impostor in its
  look's colours, and once it is a few pixels across on screen its generated planet stands at the same place and size (the K
  largest on screen; maps preloaded for the system the camera goes to, so nothing waits). The Earth is the hand-made one.
- "Cette fois du propre direct, à l'identique, bien propre et best practice" (13:06).

### The files (radical, from the start; Alexis 13:10: "radical et propre, dead code supprimé, sans dette technique")

Done 13:10: `app/src/scene/` and `app/lab/` deleted; kept and moved to `app/src/space/`: `planet/` (generated worlds), `earth/look.ts`,
`earth/maps.ts`, `disposer.ts`, `motion.ts`, `openEvent.ts`, `overScene.ts`, `keyHeld.ts`, `onResize.ts`, `rig/{pose,flight,free,rig,
speed,speedShaders,scan,scanShaders}.ts`.

`app/src/space/` (no React; the demo's script, typed): `scene.ts` (renderer, camera, rAF loop, events), `layout.ts` (worlds → systems
and planets, seeded by FNV-1a of ids; home system = the Earth with the namespace `gov` if any, else the liveliest), `planets.ts`
(instanced impostors, colours from `planet/generated.ts`'s `worldOf(id)` look), `near.ts` (the K largest on screen as generated
planets, maps preloaded), `earth/earth.ts` (the hand-made Earth), `suns.ts`, `dust.ts`, `stars.ts`, `orbits.ts`, `plate.ts` (GL
plate behind the planet), `labels.ts` (HTML pills: a click enters the page), `pick.ts`, `goals.ts` (universe, system, planet poses).

`app/src/features/universe/` rewritten small: `space.ts` (the bridge: mounts the canvas, loads the engine, hands it the page's
place and `[data-globe]` circle, turns its events into the arrival, the level and navigation through `lib/hubWorld.ts`'s
`pagesOf`), `useSpace.ts`, `useCosmosAddress.ts`, `views.ts` (`useResting`, the ViewSwitch), `ViewSwitch.tsx`, `SystemCrumb.tsx`,
`SpaceLoader.tsx`, `arrival.ts`, `rise.ts`, `newcomer.ts`, `worldsCount.ts`, `worldsFile.ts`. Everything else of it deleted.
- To bring back after the engine runs (13:40): the rail of worlds (`Rail.tsx`, `railWorlds.ts`, `railDock.ts`, its data from the old
  `worldsFeed.ts` and `signals.ts`: names, presence, visits; all in the backup stash), on a clean data source of its own; the loader
  (`SpaceLoader.tsx`, kept) mounted on the home; the system crumb (`SystemCrumb.tsx`, kept) mounted on the home when it rests at a
  system; the credits (`Credits.tsx`, restored).
