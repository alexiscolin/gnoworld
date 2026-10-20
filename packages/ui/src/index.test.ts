import type { ComponentProps } from "react";
import { expect, it } from "vitest";
import * as ui from "./index.ts";
import type { Unstyled } from "./testing.tsx";

// No component the entry gives takes className or style (docs/DESIGN-SYSTEM.md, "No outside
// styling"): tsc fails this object the day one does, or the day a component joins the entry.
type Exported = typeof ui;
const unstyled: { [Name in keyof Exported]: Unstyled<ComponentProps<Exported[Name]>> } = {
  Button: true,
  Center: true,
  Cluster: true,
  EmptyState: true,
  Flash: true,
  Grid: true,
  Icon: true,
  IconButton: true,
  Kicker: true,
  Sidebar: true,
  Stack: true,
  Switcher: true,
};

// What @gnoworld/ui gives the app and the admin console: a component left out of the entry
// would pass its own tests and still be out of their reach.
it("exports every component of the design system, and nothing else", () => {
  expect(Object.keys(ui).sort()).toEqual(
    [
      "Button",
      "Center",
      "Cluster",
      "EmptyState",
      "Flash",
      "Grid",
      "Icon",
      "IconButton",
      "Kicker",
      "Sidebar",
      "Stack",
      "Switcher",
    ].sort(),
  );
  for (const component of Object.values(ui)) expect(typeof component).toBe("function");
});

it("lets no component it exports take outside styling", () => {
  expect(Object.values(unstyled).every(Boolean)).toBe(true);
});
