// @vitest-environment jsdom
import { act, useEffect } from "react";
import { describe, expect, it } from "vitest";
import { drawer } from "../../../tests/mount.tsx";
import { useNaming } from "./naming.ts";

const A = "g1aaaa";
const B = "g1bbbb";

interface Page {
  connecting: boolean;
  address: string | undefined;
  universe: string;
}

let held: ReturnType<typeof useNaming> | undefined;

function Probe({ connecting, address, universe }: Page) {
  const naming = useNaming(connecting, address, universe);
  useEffect(() => {
    held = naming;
  });
  return null;
}

const now = () => {
  if (held === undefined) throw new Error("the probe was not drawn");
  return held;
};

// A page whose login and universe change as `at` says, and whose label answers as `answer` says.
function page(start: Page) {
  const draw = drawer();
  draw(<Probe {...start} />);
  return {
    at: (next: Page) => {
      draw(<Probe {...next} />);
    },
    answer: (pickable: boolean | undefined) => {
      act(() => {
        now().setPickable(pickable);
      });
    },
  };
}

// A Connect: a login under way, then the session in for `address`, or still out when it failed.
function connect(on: ReturnType<typeof page>, address: string | undefined, universe = "onyx") {
  on.at({ connecting: true, address: undefined, universe });
  on.at({ connecting: false, address, universe });
}

describe("the name dialog after a Connect (D13953)", () => {
  it("opens once the chain answers that the account just connected has no name, and Later closes it for good", () => {
    const on = page({ connecting: false, address: undefined, universe: "onyx" });
    connect(on, A);
    expect(now().naming).toBe(false);
    on.answer(true);
    expect(now().naming).toBe(true);
    act(() => {
      now().setNaming(false);
    });
    on.answer(false);
    on.answer(true);
    expect(now().naming).toBe(false);
  });

  it("never opens for a session found at the page's load", () => {
    const on = page({ connecting: false, address: A, universe: "onyx" });
    on.answer(true);
    expect(now().naming).toBe(false);
  });

  it("does not open later on another universe's chain once the first answer said the account has a name", () => {
    const on = page({ connecting: false, address: undefined, universe: "onyx" });
    connect(on, A);
    on.answer(false);
    on.at({ connecting: false, address: A, universe: "gnoland" });
    on.answer(true);
    expect(now().naming).toBe(false);
  });

  it("forgets the ask at a new universe before any answer came", () => {
    const on = page({ connecting: false, address: undefined, universe: "onyx" });
    connect(on, A);
    on.at({ connecting: false, address: A, universe: "gnoland" });
    on.answer(true);
    expect(now().naming).toBe(false);
  });

  it("does not carry a dialog left open at a sign-out to the next account, nor the last account's answer", () => {
    const on = page({ connecting: false, address: undefined, universe: "onyx" });
    connect(on, A);
    on.answer(true);
    expect(now().naming).toBe(true);
    on.at({ connecting: false, address: undefined, universe: "onyx" });
    connect(on, B);
    expect(now().naming).toBe(false);
    on.answer(false);
    expect(now().naming).toBe(false);
  });

  it("does not open when a Connect failed and a session comes later by another way", () => {
    const on = page({ connecting: false, address: undefined, universe: "onyx" });
    connect(on, undefined);
    on.at({ connecting: false, address: A, universe: "onyx" });
    on.answer(true);
    expect(now().naming).toBe(false);
  });

  it("offers the menu's Pick a name only on the chain's answer that the account has none", () => {
    const on = page({ connecting: false, address: A, universe: "onyx" });
    expect(now().pickable).toBe(false);
    on.answer(true);
    expect(now().pickable).toBe(true);
    on.answer(undefined);
    expect(now().pickable).toBe(false);
  });
});
