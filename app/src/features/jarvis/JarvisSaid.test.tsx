// @vitest-environment jsdom
import { act } from "react";
import { MemoryRouter } from "react-router";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Result } from "../../lib/api/http.ts";
import type { KeptAnswer } from "../../lib/api/jarvis.ts";
import { StoreProvider } from "../../storeContext.tsx";
import { SignedIn } from "../../../tests/grabStore.tsx";
import { CHAIN, listing } from "../../../tests/callFixtures.ts";
import { modals, mount, one, settled } from "../../../tests/mount.tsx";
import { drawing } from "../chat/index.ts";
import { drawerOf } from "./drawer.ts";
import type { DrawMarkdown } from "./AnswerCard.tsx";
import { JarvisSaid } from "./JarvisSaid.tsx";

// A kept public answer, read by its line's msgid, is drawn as Jarvis's card; a failed read draws nothing, so the line's plain text stays.
const ANSWERED: KeptAnswer = {
  answer: { status: "answered", markdown: "It closes **today**.", buttons: [] },
  asker: "g1jg8m…vsqf5",
};

let drawn: DrawMarkdown;
beforeAll(async () => {
  // jsdom has no reportError, where a read that throws sends its error.
  vi.stubGlobal("reportError", vi.fn());
  modals();
  drawn = drawerOf(await drawing());
});

function draw(result: Result<KeptAnswer>, fallback?: string) {
  const read = vi.fn(() => Promise.resolve(result));
  const box = mount(
    <MemoryRouter>
      <StoreProvider>
        <SignedIn />
        <JarvisSaid
          room="#bubble"
          msgid="m1"
          read={read}
          fallback={fallback}
          card={{
            chain: CHAIN,
            options: { fetch: () => listing([]) },
            gnoweb: CHAIN.gnoweb,
            own: "https://gnoworld.test",
            draw: drawn,
            onFly: vi.fn(),
          }}
        />
      </StoreProvider>
    </MemoryRouter>,
  );
  return { box, read };
}

describe("a kept public answer of Jarvis", () => {
  it("is read once by its room and msgid and drawn as Jarvis's card", async () => {
    const { box, read } = draw({ ok: true, value: ANSWERED });
    await settled(() => box.querySelector("[data-jarvis-markdown]") !== null);
    expect(one(box, "[data-jarvis-markdown]").textContent).toContain("It closes today.");
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith("#bubble", "m1");
  });

  it("names its asker by the short address the door gave", async () => {
    const { box } = draw({ ok: true, value: ANSWERED });
    await settled(() => box.querySelector("[data-jarvis-markdown]") !== null);
    expect(box.textContent).toContain("asked by g1jg8m…vsqf5");
  });

  it.each([
    ["the read is unavailable", { ok: false, reason: "unavailable" }],
    ["the answer is malformed", { ok: false, reason: "malformed" }],
    ["the line has no answer kept", { ok: false, reason: "not_found" }],
    ["the answer is no answered one", { ok: true, value: { answer: { status: "spent" }, asker: "g1jg8m…vsqf5" } }],
  ] as [string, Result<KeptAnswer>][])("draws no card, and keeps the plain line, when %s", async (_name, result) => {
    const { box, read } = draw(result, "plain excerpt");
    expect(box.textContent).toContain("plain excerpt");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(read).toHaveBeenCalledTimes(1);
    expect(box.querySelector("[data-jarvis-markdown]")).toBeNull();
    expect(box.textContent).toContain("plain excerpt");
  });

  it("shows the plain line while the read is out, then the card in its place, the read made once", async () => {
    const { box, read } = draw({ ok: true, value: ANSWERED }, "plain excerpt");
    expect(box.textContent).toContain("plain excerpt");
    await settled(() => box.querySelector("[data-jarvis-markdown]") !== null);
    expect(box.textContent).not.toContain("plain excerpt");
    expect(read).toHaveBeenCalledTimes(1);
  });
});
