import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ABUSE, eachStory, staysText } from "../testing.tsx";
import { Avatar } from "./Avatar.tsx";
import * as stories from "./Avatar.stories.tsx";
import { partsFrom } from "./parts.ts";

const ONE = "g1leu8d2vsplhehcfkjg50mwgdpxdkt8tztu95wr";
const OTHER = "g12yg9nh4ncma44emgm8msxe8aavzywt0p95tanv";

// What a face draws, its ids and the references to them left out: two faces of one address draw the
// same, ids apart.
function drawn(svg: Element | null) {
  return [...(svg?.querySelectorAll("*") ?? [])].map((shape) =>
    [
      shape.tagName,
      ...[...shape.attributes]
        .filter(({ name }) => name !== "id")
        .map(({ name, value }) => `${name}=${value.replace(/#[^)]*/g, "#")}`),
    ].join(" "),
  );
}

// A point of the face as drawn, from a star's centre or the line's "x,y".
const at = (star: Element) => [Number(star.getAttribute("cx")), Number(star.getAttribute("cy"))] as const;
const line = (svg: ParentNode) =>
  (svg.querySelector("polyline")?.getAttribute("points") ?? "").split(" ").map((point) => point.split(",").map(Number));
// A cloud's colour as drawn: its first stop's hue, saturation and lightness.
const hsl = (cloud: Element) =>
  /^hsl\(([\d.]+) (\d+)% (\d+)%\)$/.exec(cloud.querySelector("stop")?.getAttribute("stop-color") ?? "")?.slice(1) ?? [];
// Which of the address's stars a point is: the nearest.
const nearest = (stars: readonly (readonly [number, number])[], [x = 0, y = 0]: readonly number[]) => {
  const far = stars.map(([u, v]) => Math.hypot(u - x, v - y));
  return far.indexOf(Math.min(...far));
};

describe("Avatar", () => {
  it("is a picture named by the name it is given, never by its face", () => {
    const { container } = render(<Avatar address={ONE} name="nym-ada042" />);
    expect(screen.getByRole("img", { name: "nym-ada042" })).toBeTruthy();
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("is medium unless asked, and small or large when asked", () => {
    const { rerender } = render(<Avatar address={ONE} name="a" />);
    expect(screen.getByRole("img").dataset["size"]).toBe("m");
    for (const size of ["s", "l"] as const) {
      rerender(<Avatar address={ONE} name="a" size={size} />);
      expect(screen.getByRole("img").dataset["size"]).toBe(size);
    }
  });

  it("draws the same face for the same address at every size, and another for another address", () => {
    const one = render(<Avatar address={ONE} name="a" size="s" />);
    const again = render(<Avatar address={ONE} name="a" size="l" />);
    const other = render(<Avatar address={OTHER} name="b" />);
    const [a, b, c] = [one, again, other].map(({ container }) => drawn(container.querySelector("svg")));
    expect(b).toEqual(a);
    expect(c).not.toEqual(a);
  });

  it("draws its address's three clouds, in its hues at 85% and 60%, where its parts put them", () => {
    const { container } = render(<Avatar address={ONE} name="a" />);
    const parts = partsFrom(ONE);
    const clouds = [...container.querySelectorAll("radialGradient")];
    expect(clouds).toHaveLength(3);
    for (const [i, cloud] of clouds.entries()) {
      const [hue, s, l] = hsl(cloud);
      expect([s, l]).toEqual(["85", "60"]);
      expect(Number(hue)).toBeCloseTo(parts?.hues[i] ?? -1, 0);
      const [x = -1, y = -1] = parts?.clouds[i] ?? [];
      expect(Number(cloud.getAttribute("cx"))).toBeCloseTo(x, 2);
      expect(Number(cloud.getAttribute("cy"))).toBeCloseTo(y, 2);
    }
  });

  it("draws its address's five stars where its parts put them, the bright one its own", () => {
    const { container } = render(<Avatar address={ONE} name="a" />);
    const stars = partsFrom(ONE)?.stars ?? [];
    const drawnStars = [...container.querySelectorAll("[data-star]")];
    const points = drawnStars.map(at);
    expect(points).toHaveLength(5);
    for (const [i, [x, y]] of stars.entries()) {
      expect(points[i]?.[0]).toBeCloseTo(x, 1);
      expect(points[i]?.[1]).toBeCloseTo(y, 1);
    }
    const bright = container.querySelectorAll("[data-star='bright']");
    expect(bright).toHaveLength(1);
    const brightest = drawnStars.indexOf(bright[0] ?? container);
    expect(brightest).toBe(partsFrom(ONE)?.bright);
    expect(container.querySelectorAll("[data-star='']")).toHaveLength(4);
    // One halo, round the bright star; the bright star larger than the others, which are alike.
    const halos = [...container.querySelectorAll("circle:not([data-star]):not([fill])")];
    expect(halos.map(at)).toEqual([points[brightest]]);
    const radii = drawnStars.map((star) => Number(star.getAttribute("r")));
    const others = new Set(radii.filter((_, i) => i !== brightest));
    expect(others.size).toBe(1);
    expect(Math.min(...others)).toBeGreaterThan(0);
    expect(radii[brightest]).toBeGreaterThan(Math.max(...others));
  });

  it("joins its stars in its address's order: each star once, three orders three lines", () => {
    const BECH32 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
    const byOrder = new Map<number, string>();
    for (let n = 0; byOrder.size < 3 && n < 1_000; n++) {
      const address = `g1${Array.from({ length: 38 }, (_, i) => BECH32[(n * 7 + i * (n + 3)) % 32] ?? "q").join("")}`;
      const order = partsFrom(address)?.order;
      if (order !== undefined && !byOrder.has(order)) byOrder.set(order, address);
    }
    const joins = [...byOrder.values()].map((address) => {
      const { container, unmount } = render(<Avatar address={address} name="a" />);
      const stars = partsFrom(address)?.stars ?? [];
      const join = line(container).map((point) => nearest(stars, point));
      unmount();
      expect([...join].sort()).toEqual([0, 1, 2, 3, 4]);
      return join.join("");
    });
    expect(new Set(joins).size).toBe(3);
  });

  it("draws the night disc alone for what is not an address, still named", () => {
    const { container } = render(<Avatar address="not-an-address" name="A name" />);
    expect(screen.getByRole("img", { name: "A name" })).toBeTruthy();
    expect(container.querySelector("polyline, radialGradient, [data-star]")).toBeNull();
  });

  it("says the assistant is one, and draws its violet orb, no constellation", () => {
    const { container } = render(<Avatar address={ONE} name="Jarvis" kind="assistant" />);
    const avatar = screen.getByRole("img", { name: "Jarvis, assistant" });
    expect(avatar.dataset["kind"]).toBe("assistant");
    expect(container.querySelector("polyline")).toBeNull();
    expect(container.querySelector("[data-orb]")).not.toBeNull();
  });

  it("says a bot is one, and draws the code icon", () => {
    const { container } = render(<Avatar address={ONE} name="The quiz bot" kind="bot" />);
    expect(screen.getByRole("img", { name: "The quiz bot, bot" })).toBeTruthy();
    expect(container.querySelector("svg[data-icon='code']")).not.toBeNull();
    expect(container.querySelector("polyline")).toBeNull();
  });

  it("says both when one is here and speaks, with the dot and the ring", () => {
    const { container } = render(<Avatar address={ONE} name="a" here speaking />);
    const avatar = screen.getByRole("img", { name: "a, here now, speaking" });
    expect(avatar.hasAttribute("data-speaking")).toBe(true);
    expect(container.querySelector("[data-presence]")).not.toBeNull();
  });

  it("says who is here now, with a dot, and who speaks, with a ring", () => {
    const { container, rerender } = render(<Avatar address={ONE} name="a" here />);
    expect(screen.getByRole("img", { name: "a, here now" }).hasAttribute("data-speaking")).toBe(false);
    expect(container.querySelector("[data-presence]")).not.toBeNull();
    rerender(<Avatar address={ONE} name="a" speaking />);
    expect(screen.getByRole("img", { name: "a, speaking" }).hasAttribute("data-speaking")).toBe(true);
    expect(container.querySelector("[data-presence]")).toBeNull();
  });

  it("is decoration beside a name that says it already", () => {
    const { container } = render(<Avatar address={ONE} name="a" decorative />);
    expect(screen.queryByRole("img")).toBeNull();
    expect((container.firstElementChild as HTMLElement).getAttribute("aria-hidden")).toBe("true");
  });

  it("gives each face ids of its own, each reference pointing inside its own face", () => {
    const { container } = render(
      <>
        <Avatar address={ONE} name="a" />
        <Avatar address={ONE} name="a" />
        <Avatar address={ONE} name="J" kind="assistant" />
        <Avatar address={ONE} name="J" kind="assistant" />
      </>,
    );
    const ids = [...container.querySelectorAll("[id]")].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    let references = 0;
    for (const svg of container.querySelectorAll("svg")) {
      const own = new Set([...svg.querySelectorAll("[id]")].map((e) => e.id));
      for (const { name, value } of [...svg.querySelectorAll("*")].flatMap((e) => [...e.attributes])) {
        const target = /url\(#([^)]+)\)/.exec(value)?.[1] ?? (name === "href" ? value.replace(/^#/, "") : undefined);
        if (target === undefined) continue;
        references++;
        expect(own.has(target)).toBe(true);
      }
    }
    // Three clouds a person, one orb an assistant.
    expect(references).toBe(8);
  });

  it("shows a name made of markup, or very long, as text", () => {
    staysText((text) => <Avatar address={ONE} name={text} />);
  });

  it("draws the night disc for an address made of markup, or very long, its name still said", () => {
    for (const text of ABUSE) {
      const { container, unmount } = render(<Avatar address={text} name="A name" />);
      expect(screen.getByRole("img", { name: "A name" })).toBeTruthy();
      expect(container.querySelector("polyline, radialGradient, [data-star]")).toBeNull();
      expect(container.textContent).toBe("");
      unmount();
    }
  });

  it("has stories for each size and kind, here, speaking, no address, and the spread", () => {
    const shown = eachStory(stories, (container) =>
      [...container.querySelectorAll<HTMLElement>("[data-kind]")].map((a) => ({
        size: a.dataset["size"],
        kind: a.dataset["kind"],
        here: a.querySelector("[data-presence]") !== null,
        speaking: a.hasAttribute("data-speaking"),
        stars: a.querySelectorAll("[data-star]").length,
      })),
    );
    const all = shown.flat();
    for (const size of ["s", "m", "l"]) expect(all.some((a) => a.size === size)).toBe(true);
    for (const kind of ["person", "assistant", "bot"]) expect(all.some((a) => a.kind === kind)).toBe(true);
    expect(all.some((a) => a.here) && all.some((a) => a.speaking)).toBe(true);
    expect(all.some((a) => a.kind === "person" && a.stars === 0)).toBe(true);
    expect(shown.some((faces) => faces.length === 200)).toBe(true);
  });
});
