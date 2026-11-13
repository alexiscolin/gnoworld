// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { RealmRollup } from "@gnoworld/schemas/indexer";
import { standInPopovers } from "../../../tests/popover.ts";
import { Callers } from "./Callers.tsx";

// The person card is the chat's: this reads which address each caller hands it.
vi.mock("../../features/chat/index.ts", () => ({
  PersonLink: ({ address, children }: { address: string; children: ReactNode }) =>
    createElement("button", { "data-card": address }, children),
}));
// jsdom has no popover API: the card's expand button asks for one.
standInPopovers();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const A = "g1n4plarhmtarhmtarhmtarhmtarhmtarhmtarhmt";
const B = "g1b4plarhmtarhmtarhmtarhmtarhmtarhmtarhmt";

it("opens the person card of each caller's own address, by its face and by its name", () => {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  const rollup = {
    top: [
      { address: A, calls: 3 },
      { address: B, calls: 1 },
    ],
    callers: 2,
    days: [],
    updated: null,
  };
  act(() => {
    root.render(createElement(Callers, { rollup: rollup as unknown as RealmRollup, worlds: undefined }));
  });
  const opened = [...host.querySelectorAll("[data-card]")].map((node) => node.getAttribute("data-card"));
  expect(opened).toEqual([A, A, B, B]);
  act(() => {
    root.unmount();
  });
});
