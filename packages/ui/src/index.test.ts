import { expect, it } from "vitest";
import * as ui from "./index.ts";

// What @gnoworld/ui gives the app and the admin console: a component left out of the entry
// would pass its own tests and still be out of their reach.
it("exports every component of the design system, and nothing else", () => {
  expect(Object.keys(ui).sort()).toEqual(
    ["Button", "Center", "Cluster", "Grid", "Icon", "IconButton", "Kicker", "Sidebar", "Stack", "Switcher"].sort(),
  );
  for (const component of Object.values(ui)) expect(typeof component).toBe("function");
});
