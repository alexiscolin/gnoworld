import { describe, expect, it } from "vitest";
import { inSystem } from "./views.ts";

// The Earth's system (D401, D501) holds the Earth and the worlds of the namespaces that orbit it, not only gnoland's: its rail missed
// the Earth (Alexis, 2026-11-11: "pourquoi on ne voit pas la Terre dans le rail en haut ?").
describe("inSystem", () => {
  it("keeps the Earth and every home namespace's worlds in the Earth's system", () => {
    for (const id of ["earth", "gnoland/blog", "gov/dao", "sys/users", "demo/boards"])
      expect(inSystem(id, "gnoland")).toBe(true);
    expect(inSystem("gov/dao", "gov")).toBe(true);
    expect(inSystem("earth", "gov")).toBe(true);
  });

  it("keeps another system's worlds to itself", () => {
    expect(inSystem("nym-alexiscolin000/gnoradio", "nym-alexiscolin000")).toBe(true);
    expect(inSystem("earth", "nym-alexiscolin000")).toBe(false);
    expect(inSystem("gov/dao", "nym-alexiscolin000")).toBe(false);
    expect(inSystem("nym-alexiscolin000/gnoradio", "gnoland")).toBe(false);
    expect(inSystem("gnolandish/x", "gnoland")).toBe(false);
  });
});
