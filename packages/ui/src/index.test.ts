import type { ComponentProps } from "react";
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
