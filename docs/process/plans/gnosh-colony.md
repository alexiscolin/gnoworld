# gnosh's colony: a station on its own orbit round gno.land's sun (one pull request)

Alexis's "ok design A" (2026-11-17) on the preview's second version: the offset crown, a Stanford wheel with a second, leaned wheel,
mirror petals, docks and lit lanes (D13740); textures at 512 px (D13741). Tests first, then the code; one pull request.

1. **Data.** gnosh-ai stays a hub of kind "station"; its description says where it stands. It is the one station shown (`shownStation`
   in core, beside `STATIONS_SHOWN`, which stays false for the others). It keeps its row in `earthOrbit.json` for its site's link.
2. **Its place.** The scene adds it to the home system (namespace gnoland), so it takes an orbit of its own past the Earth's;
   its label reads "gnosh.ai" (`nameOf` finds a hub by slug too).
3. **Its body.** `drawnOf` gives gnosh-ai the colony in place of a seeded planet: a `Planet` whose group holds the crown at two levels
   of detail, lit by its system's sun with shadows, its windows lit on the night side. Its code is a chunk of its own, asked only when
   the colony is drawn near, so nothing of it is in a first screen; until it comes the planet's skeleton stands as for any world.
4. **Its textures.** Hull plates, their normals and roughness, drawn in the code at 512 px; no file, no dependency.
5. **Its signs.** The colony names points on its hull (wheel sections, the hub), each with its normal; a world's sign there stands on
   one of them, hides when its face turns away or the colony stands between it and the eye, as the Earth's far side does.
6. **Everywhere a world shows.** The chat's worlds column, ⌘K's stations group, the full chat's 3D panel and the phone's row and band
   draw it: its picture (`worldPictures`, retaken by the capture tool) and the small views' scene (`MiniSpace`) are the colony's.
7. **Its rooms.** Its main room reads #general, as the Earth's; #help and #showcase are listed in `server/roles.json` (tier 1, data
   alone) and made ahead with the hubs' main rooms (`server/src/rooms/ahead.ts`).
8. **Budgets.** The colony's chunk gets its cap in `chunks.ts`; the precache total keeps its cap.
9. **Tests.** Each point above: data and layout, anchors on the hull (a ray along each anchor's normal meets the hull there),
   the worlds column, search, phone row, the picture, two levels of detail, the chunk loaded late (no first screen asks it).
10. **Reviews.** reviewer, security-reviewer (`server/roles.json`), design-reviewer against the validated preview.

## Files

- Data: `app/data/hubs.json`; `server/roles.json`; `app/src/lib/worldPictures.json` and gnosh-ai's picture.
- Core: `packages/core/src/station/station.ts`, `packages/core/src/index.ts`.
- Scene: `app/src/space/colony/` (new: `crown.ts`, `hull.ts`, `materials.ts`, `colony.ts`, `anchors.ts`), `app/src/space/parts/draw.ts`,
  `app/src/space/scene.ts` (`#add`), `app/src/space/earth/ground.ts` (a mark on a hull point).
- App: `app/src/places.ts`, `app/src/placeName.ts`, `app/src/space/portraits.ts`, `app/tests/tools/pictureInputs.ts`,
  `app/src/features/chat/rooms/names.ts`, `app/src/features/universe/signals.ts`.
- Server: `server/src/rooms/ahead.ts`, `server/src/rooms/roomsBoot.ts`.
- Tests: the files beside each, `app/tests/e2e/chunks.ts`, a journey `app/tests/e2e/colony.spec.ts`.
- Decisions D13740-D13769, findings F13780-F13799 in `docs/process/`.
