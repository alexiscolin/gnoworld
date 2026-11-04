import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { BellSlot, PassportSlot, plug, slot } from "./slots.tsx";

// Slice 8's slots: a part plugs its piece in, and the header or the passport draws it; one nobody filled draws nothing.
test("draws nothing for a slot nobody filled, and what fills it once plugged, with its props", async () => {
  expect(renderToStaticMarkup(<BellSlot />)).toBe("");
  expect(renderToStaticMarkup(<PassportSlot name="passportQuests" universe="onyx" />)).toBe("");
  plug("bell", () => <span>bell</span>);
  plug("passportQuests", ({ universe }) => <p>quests of {universe}</p>);
  plug("arrivalLine", (arrival) => Promise.resolve(arrival.stamped ? undefined : "Today's expedition · 1 of 3"));
  expect(renderToStaticMarkup(<BellSlot />)).toBe("<span>bell</span>");
  expect(renderToStaticMarkup(<PassportSlot name="passportQuests" universe="onyx" />)).toBe("<p>quests of onyx</p>");
  const line = slot("arrivalLine");
  await expect(
    line?.({ key: "onyx:govdao", universe: "onyx", name: "GovDAO", day: "2026-11-04", stamped: false }, () => true),
  ).resolves.toBe("Today's expedition · 1 of 3");
});
