import type { ComponentProps } from "react";
import { build, type Rolldown } from "vite";
import { expect, it } from "vitest";
import * as ui from "./index.ts";
import type { Unstyled } from "./testing.tsx";

// No component the entry gives takes className or style (docs/DESIGN-SYSTEM.md, "No outside
// styling"): tsc fails this object the day one does, or the day a component joins the entry.
type Exported = typeof ui;
const unstyled: { [Name in keyof Exported]: Unstyled<ComponentProps<Exported[Name]>> } = {
  Button: true,
  ActivityChart: true,
  Avatar: true,
  Card: true,
  Center: true,
  Chip: true,
  Cluster: true,
  Dialog: true,
  EmptyState: true,
  Field: true,
  Flash: true,
  Grid: true,
  Icon: true,
  IconButton: true,
  Kicker: true,
  LinkProvider: true,
  Menu: true,
  PlanetThumb: true,
  Popover: true,
  Row: true,
  Sidebar: true,
  Skeleton: true,
  Stack: true,
  Stat: true,
  Switcher: true,
  Tabs: true,
  Tooltip: true,
};
// A component's named parts are statics of it, which the map above does not reach.
const parts: [
  Unstyled<ComponentProps<typeof ui.Card.Header>>,
  Unstyled<ComponentProps<typeof ui.Card.Body>>,
  Unstyled<ComponentProps<typeof ui.Card.Actions>>,
] = [true, true, true];

// What @gnoworld/ui gives the app and the admin console: a component left out of the entry
// would pass its own tests and still be out of their reach.
it("exports every component of the design system, and nothing else", () => {
  expect(Object.keys(ui).sort()).toEqual(
    [
      "ActivityChart",
      "Avatar",
      "Button",
      "Card",
      "Center",
      "Chip",
      "Cluster",
      "Dialog",
      "EmptyState",
      "Field",
      "Flash",
      "Grid",
      "Icon",
      "IconButton",
      "Kicker",
      "LinkProvider",
      "Menu",
      "PlanetThumb",
      "Popover",
      "Row",
      "Sidebar",
      "Skeleton",
      "Stack",
      "Stat",
      "Switcher",
      "Tabs",
      "Tooltip",
    ].sort(),
  );
  for (const component of Object.values(ui)) expect(typeof component).toBe("function");
});

it("lets no component it exports take outside styling", () => {
  expect([...Object.values(unstyled), ...parts].every(Boolean)).toBe(true);
});

const here = (path: string) => decodeURIComponent(new URL(path, import.meta.url).pathname);
const ENTRY = "\0layers-entry";
// The six layers in their order of strength, as styles.css declares them.
const ORDER = ["reset", "tokens", "base", "compositions", "components", "utilities"];

// Layers rank by their first mention in the page's CSS, and a bundler may emit a component's sheet before
// styles.css: an app importing the components first, as the import lint orders it, then the sheet, must
// still meet the six layers in their order, or reset and base outrank the components (F363).
it("an app importing the components before the sheet meets the layers in their order", async () => {
  const output = await build({
    configFile: false,
    logLevel: "silent",
    build: { write: false, rolldownOptions: { input: ENTRY } },
    plugins: [
      {
        name: "entry",
        resolveId: (id) => (id === ENTRY ? id : null),
        load: (id) =>
          id === ENTRY
            ? `import { Button } from ${JSON.stringify(here("./index.ts"))};\nimport ${JSON.stringify(here("./styles.css"))};\nexport { Button };\n`
            : null,
      },
    ],
  });
  const chunks = (Array.isArray(output) ? output : [output]).flatMap((o) => (o as Rolldown.RolldownOutput).output);
  const css = chunks.flatMap((chunk) =>
    chunk.type === "asset" && chunk.fileName.endsWith(".css") ? [String(chunk.source)] : [],
  );
  const named = css.join("\n").matchAll(/@layer\s+([\w\s,]+?)\s*[{;]/g);
  const met = [...new Set([...named].flatMap((m) => (m[1] ?? "").split(",").map((name) => name.trim())))];
  expect(met).toEqual(ORDER);
});
