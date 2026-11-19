// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { plateOf } from "./pageCircle.ts";

afterEach(() => {
  document.body.replaceChildren();
});

// The scene's fill fades where the plate's own does, --plate-fade short of its right edge, past the content's air (D14002): never at the
// content's end padding, which the air widens.
it("tells the scene the plate's fade starts --plate-fade short of its right edge, whatever the content's padding", () => {
  const plate = document.createElement("section");
  plate.dataset["look"] = "plate";
  plate.style.setProperty("--plate-fade", "64px");
  const content = document.createElement("div");
  content.dataset["content"] = "";
  content.style.paddingInlineEnd = "88px";
  plate.append(content);
  document.body.append(plate);
  plate.getBoundingClientRect = () => DOMRect.fromRect({ x: 24, y: 98, width: 832, height: 900 });
  expect(plateOf()?.fade).toBe(24 + 832 - 64);
});

it("tells none where the page has no plate", () => {
  expect(plateOf()).toBeUndefined();
});
