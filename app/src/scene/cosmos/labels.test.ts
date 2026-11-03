// @vitest-environment jsdom
import { chooseLabels, LABEL_SLOTS, PLACE, toScene, type Label, type LabelAsk, type Point } from "@gnoworld/core";
import { Vector3 } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Labels, type Projector } from "./labels.ts";
import styles from "./labels.module.css";

// The cosmos's labels on the page (ADR-0002 §9: HTML labels pooled, never made each frame; slice 7 §3: text only, off each other): eight
// elements made once, their words written as text ten times a second at most, each frame moving them beside their bodies.
const SCREEN = { width: 1728, height: 1080 };
const projector = (box?: { left: number; top: number; right: number; bottom: number }, screen = SCREEN): Projector => {
  const spot = { x: 0, y: 0, radius: 0, depth: 0 };
  const onStage = { x: 0, y: 0, z: 0 };
  return {
    sight: { ...screen, box },
    seen(at: Vector3, radius: number) {
      spot.x = screen.width / 2 + at.x * 20;
      spot.y = screen.height / 2 - at.y * 20;
      spot.radius = radius * 20;
      spot.depth = -at.z;
      return spot;
    },
    fromEye(place: Point, eye: Point, out: Vector3) {
      toScene(place, onStage);
      return out.set(onStage.x - eye.x, onStage.y - eye.y, onStage.z - eye.z);
    },
  };
};
const body = (x: number, y: number, radius = 1) => ({
  position: new Vector3(x, y, -20),
  scale: { x: radius },
  visible: true,
});
const labelled = (asks: readonly LabelAsk[]): Label[] => chooseLabels(asks);
// The labels of `asks`, each of them, in their order: a missing one fails the test where it is asked.
const each = (asks: readonly LabelAsk[], count: number): Label[] => {
  const made = labelled(asks);
  if (made.length < count) throw new Error("a label is missing");
  return made;
};
// Each label's place, in its slot's order, read from the layout the stats hand over (as the journeys read it).
const placed = (labels: Labels) => {
  const { layout, labels: held } = labels.stats();
  return [...layout.order].flatMap((index) => {
    const label = held[index];
    const read = (values: Float64Array) => values[index] ?? Number.NaN;
    return label === undefined
      ? []
      : [
          {
            ...label,
            shown: layout.shown[index] === 1,
            left: read(layout.left),
            top: read(layout.top),
            width: read(layout.width),
            height: read(layout.height),
            scale: read(layout.scale),
            fade: read(layout.fade),
          },
        ];
  });
};
// One label's place, every field a number.
const statOf = (labels: Labels, at = 0) => {
  const stat = placed(labels)[at];
  if (stat === undefined) throw new Error("no such label");
  return stat;
};
const near = (id: string, name?: string): LabelAsk => ({ id, kind: "near", ...(name === undefined ? {} : { name }) });
const EYE = { x: 0, y: 0, z: 0 };
let labels: Labels;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(150);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(32);
  labels = new Labels(document, projector());
});
afterEach(() => {
  labels.dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const layer = () => document.body.querySelector("[aria-hidden='true']");
const slots = () => [...(layer()?.children ?? [])] as HTMLElement[];
const shown = () => slots().filter((slot) => slot.style.opacity !== "" && slot.style.opacity !== "0");
const words = (slot: HTMLElement | undefined) => [...(slot?.children ?? [])].map(({ textContent }) => textContent);

describe("the pool", () => {
  it(`keeps ${String(LABEL_SLOTS)} labels on the page, hidden from readers, made once`, () => {
    expect(slots()).toHaveLength(LABEL_SLOTS);
    expect(document.body.querySelectorAll("[aria-hidden='true']")).toHaveLength(1);
  });

  it("reuses its labels: a world kept between looks keeps its element, a new world takes a free one, none is made or dropped", () => {
    const before = slots();
    labels.show(
      labelled([near("gov/govern"), near("memba/members")]).map((label, at) => ({ label, at: body(at * 8 - 4, 0) })),
    );
    const held = before.find((slot) => slot.textContent.includes("members"));
    vi.advanceTimersByTime(200);
    labels.show(
      labelled([near("memba/members"), near("games/chess")]).map((label, at) => ({ label, at: body(at * 8 - 4, 0) })),
    );
    vi.advanceTimersByTime(200);
    const after = slots();
    expect(after).toHaveLength(LABEL_SLOTS);
    expect(after.every((slot, at) => slot === before[at])).toBe(true);
    expect(held?.textContent).toContain("members");
    expect(after.filter((slot) => slot.textContent.includes("members"))).toEqual([held]);
    expect(after.filter((slot) => slot.textContent.includes("govern"))).toEqual([]);
    expect(after.filter((slot) => slot.textContent.includes("chess"))).toHaveLength(1);
  });

  it("writes a world's words as text, markup and all", () => {
    labels.show(each([near("gov/govern", "<img src=x onerror=1>")], 1).map((label) => ({ label, at: body(0, 0) })));
    const slot = slots().find((each) => each.textContent.includes("<img"));
    expect(words(slot)[0]).toBe("<img src=x onerror=1>");
    expect(layer()?.querySelector("img")).toBeNull();
  });

  it("changes its words ten times a second at most", () => {
    labels.show(labelled([near("gov/govern")]).map((label) => ({ label, at: body(0, 0) })));
    vi.advanceTimersByTime(50);
    labels.show(labelled([near("games/chess")]).map((label) => ({ label, at: body(0, 0) })));
    expect(layer()?.textContent).toContain("govern");
    expect(layer()?.textContent).not.toContain("chess");
    vi.advanceTimersByTime(50);
    expect(layer()?.textContent).toContain("chess");
    expect(layer()?.textContent).not.toContain("govern");
  });

  it("changes its words within a tenth of a second though the wall clock steps back an hour (F3776)", () => {
    labels.show(labelled([near("gov/govern")]).map((label) => ({ label, at: body(0, 0) })));
    vi.advanceTimersByTime(50);
    vi.setSystemTime(Date.now() - 3_600_000);
    labels.show(labelled([near("games/chess")]).map((label) => ({ label, at: body(0, 0) })));
    vi.advanceTimersByTime(60);
    expect(layer()?.textContent).toContain("chess");
  });

  it(`shows the first ${String(LABEL_SLOTS)} it is given, and makes no ninth`, () => {
    const many: Label[] = Array.from({ length: LABEL_SLOTS + 3 }, (_, index) => ({
      id: `w/${String(index)}`,
      kind: "near",
      title: `world ${String(index)}`,
      count: "",
      badge: "",
      uncharted: false,
    }));
    labels.show(many.map((label, index) => ({ label, at: body(index * 3 - 15, index % 3) })));
    expect(slots()).toHaveLength(LABEL_SLOTS);
    expect(layer()?.textContent).toContain(`world ${String(LABEL_SLOTS - 1)}`);
    expect(layer()?.textContent).not.toContain(`world ${String(LABEL_SLOTS)}`);
  });

  it("lets a world that left go at once, though its words wait their tenth of a second", () => {
    labels.show(labelled([near("gov/govern")]).map((label) => ({ label, at: body(-10, 0) })));
    labels.tick(EYE, true);
    vi.advanceTimersByTime(50);
    labels.show(labelled([near("games/chess")]).map((label) => ({ label, at: body(10, 0) })));
    labels.tick(EYE, true);
    expect(placed(labels).filter(({ id }) => id === "gov/govern")).toEqual([]);
    expect(shown()).toHaveLength(0);
    vi.advanceTimersByTime(50);
    labels.tick(EYE, true);
    expect(placed(labels).map(({ id }) => id)).toEqual(["games/chess"]);
  });

  it("hides its layer while the scene's canvas is not running, a lost context included", async () => {
    const canvas = document.createElement("canvas");
    canvas.dataset["scene"] = "on";
    document.body.append(canvas);
    const watching = new Labels(document, projector());
    const layers = () => [...document.querySelectorAll<HTMLElement>("[data-labels]")];
    expect(layers().at(-1)?.hidden).toBe(false);
    canvas.dataset["scene"] = "failed";
    await Promise.resolve();
    expect(layers().at(-1)?.hidden).toBe(true);
    canvas.dataset["scene"] = "on";
    await Promise.resolve();
    expect(layers().at(-1)?.hidden).toBe(false);
    watching.dispose();
    canvas.remove();
  });

  it("leaves the page as it goes, its waiting words with it", () => {
    labels.show(labelled([near("gov/govern")]).map((label) => ({ label, at: body(0, 0) })));
    labels.show(labelled([near("games/chess")]).map((label) => ({ label, at: body(0, 0) })));
    labels.dispose();
    expect(layer()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("a frame", () => {
  it("stands each label beside its body and fades the slots no label takes", () => {
    labels.show(
      labelled([near("gov/govern"), near("memba/members")]).map((label, at) => ({ label, at: body(at * 20 - 10, 0) })),
    );
    labels.tick(EYE, true);
    expect(shown()).toHaveLength(2);
    const stat = statOf(labels);
    expect(stat.shown).toBe(true);
    expect(stat.left).toBeCloseTo(SCREEN.width / 2 - 200 - PLACE.stem * stat.scale, 6);
    expect(slots().filter((slot) => slot.style.opacity === "0")).toHaveLength(LABEL_SLOTS - 2);
  });

  it("writes on the page where the layout stands each label", () => {
    labels.show(labelled([near("gov/govern")]).map((label) => ({ label, at: body(-10, 0) })));
    labels.tick(EYE, true);
    const stat = statOf(labels);
    const [slot] = shown();
    const [, left, top, scale] =
      /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\((-?[\d.]+)\)/.exec(slot?.style.transform ?? "") ?? [];
    expect(Number(left)).toBeCloseTo(stat.left, 1);
    expect(Number(top)).toBeCloseTo(stat.top, 1);
    expect(Number(scale)).toBeCloseTo(stat.scale, 2);
    expect(slot?.style.opacity).toBe("1");
    expect(Number(slot?.style.getPropertyValue("--_fade"))).toBeCloseTo(stat.fade, 2);
  });

  it("fades a far label's words, never its pill, and an uncharted signal's not at all (frame 4's solid pills)", () => {
    const star = { x: 30, y: 0, z: -900 };
    const onStage = { x: 0, y: 0, z: 0 };
    toScene(star, onStage);
    const eye = { x: onStage.x, y: onStage.y, z: onStage.z + 400 };
    const asks: LabelAsk[] = [
      { id: "games/chess", kind: "far", signals: { here: 4 } },
      { id: "games/new", kind: "far", signals: { uncharted: true } },
    ];
    // 10 units right of the first, 200 px on this screen.
    const places = [star, { x: 40, y: 0, z: -900 }];
    labels.show(each(asks, 2).map((label, at) => ({ label, at: places[at] ?? star })));
    labels.tick(eye, true);
    const pills = shown();
    expect(pills).toHaveLength(2);
    for (const pill of pills) expect(pill.style.opacity).toBe("1");
    const fades = pills.map((pill) => Number(pill.style.getPropertyValue("--_fade"))).sort();
    expect(fades[0]).toBeLessThan(1);
    expect(fades[1]).toBe(1);
  });

  it("keeps a label off a body the view draws that has no label of its own", () => {
    const labelled_ = body(-10, 0);
    const other = body(-9.4, 3.3);
    labels.show(
      labelled([near("gov/govern")]).map((label) => ({ label, at: labelled_ })),
      [labelled_, other],
    );
    labels.tick(EYE, true);
    const stat = statOf(labels);
    expect(stat.shown).toBe(true);
    const [x, y, radius] = [SCREEN.width / 2 - 9.4 * 20, SCREEN.height / 2 - 3.3 * 20, 20];
    const right = stat.left + stat.width * stat.scale;
    const bottom = stat.top + stat.height * stat.scale;
    const apart = Math.hypot(Math.max(stat.left - x, 0, x - right), Math.max(stat.top - y, 0, y - bottom));
    expect(apart).toBeGreaterThanOrEqual(radius);
  });

  it("keeps its labels off the page's text and off the Earth", () => {
    const hero = { left: 0, top: 380, right: SCREEN.width, bottom: 520 };
    const keeping = new Labels(document, projector(hero));
    const earth = { position: new Vector3(0, 0, -20), scale: { x: 2 }, visible: true };
    const places = [earth, body(-8, -1.5)];
    keeping.show(
      each([{ id: "earth", kind: "earth" }, near("gov/govern")], 2).map((label, at) => ({
        label,
        at: places[at] ?? earth,
      })),
    );
    keeping.tick(EYE, true);
    expect(placed(keeping).filter(({ shown: on }) => on)).toHaveLength(2);
    for (const stat of placed(keeping).filter(({ shown: on }) => on)) {
      const bottom = stat.top + stat.height * stat.scale;
      expect(bottom <= hero.top || stat.top >= hero.bottom, `${stat.title} over the page's text`).toBe(true);
      const dx = Math.max(stat.left - SCREEN.width / 2, 0, SCREEN.width / 2 - stat.left - stat.width * stat.scale);
      const dy = Math.max(stat.top - SCREEN.height / 2, 0, SCREEN.height / 2 - bottom);
      if (stat.id !== "earth") expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(40);
    }
    keeping.dispose();
  });

  it("hides every label where the view draws no bodies", () => {
    labels.show(labelled([near("gov/govern")]).map((label) => ({ label, at: body(0, 0) })));
    labels.tick(EYE, true);
    labels.tick(EYE, false);
    expect(shown()).toHaveLength(0);
  });

  it("hides a body's label while the body waits off the screen", () => {
    const waiting = { ...body(0, 0), visible: false };
    labels.show(labelled([near("gov/govern")]).map((label) => ({ label, at: waiting })));
    labels.tick(EYE, true);
    expect(shown()).toHaveLength(0);
  });

  it("points a far world's label at its star, smaller and fainter than a near one's", () => {
    const asks: LabelAsk[] = [near("gov/govern"), { id: "games/chess", kind: "far", signals: { here: 4 } }];
    const star = { x: 30, y: 0, z: -900 };
    const onStage = { x: 0, y: 0, z: 0 };
    toScene(star, onStage);
    const places = [body(-10, 0), star];
    labels.show(each(asks, 2).map((label, at) => ({ label, at: places[at] ?? star })));
    labels.tick({ x: onStage.x, y: onStage.y, z: onStage.z + 400 }, true);
    const [nearStat, farStat] = [statOf(labels), statOf(labels, 1)];
    expect(farStat.shown).toBe(true);
    expect(farStat.left).toBeCloseTo(SCREEN.width / 2 - PLACE.stem * farStat.scale, 6);
    expect(farStat.scale).toBeLessThan(nearStat.scale);
    expect(farStat.fade).toBeLessThan(nearStat.fade);
  });

  it("writes nothing when nothing moved", () => {
    labels.show(labelled([near("gov/govern")]).map((label) => ({ label, at: body(0, 0) })));
    labels.tick(EYE, true);
    const changes: MutationRecord[] = [];
    const watching = new MutationObserver((records) => changes.push(...records));
    watching.observe(layer() ?? document.body, {
      attributes: true,
      subtree: true,
      childList: true,
      characterData: true,
    });
    labels.tick(EYE, true);
    changes.push(...watching.takeRecords());
    watching.disconnect();
    expect(changes).toEqual([]);
  });
});

describe("where a label may stand (F3772)", () => {
  // Each shown label's box on the screen, by its world.
  const boxOf = (from: Labels, id: string) => {
    const stat = placed(from).find((each) => each.id === id);
    if (stat === undefined) throw new Error(`no label for ${id}`);
    const right = stat.left + stat.width * stat.scale;
    return { ...stat, right, bottom: stat.top + stat.height * stat.scale };
  };
  const one = (from: Labels, at: ReturnType<typeof body>) => {
    from.show(labelled([near("gov/govern")]).map((label) => ({ label, at })));
    from.tick(EYE, true);
    return boxOf(from, "gov/govern");
  };

  it("stands a new world in a freed slot above its body, never on the side the world before it took (F3758)", () => {
    const below = one(labels, body(0, (SCREEN.height / 2 - 110) / 20));
    expect(below.top).toBeGreaterThan(110);
    vi.advanceTimersByTime(200);
    labels.show(labelled([near("games/chess")]).map((label) => ({ label, at: body(0, 0) })));
    labels.tick(EYE, true);
    expect(boxOf(labels, "games/chess").bottom).toBeLessThan(SCREEN.height / 2);
  });

  it("shows no label for a body behind the eye", () => {
    labels.show(
      labelled([near("gov/govern")]).map((label) => ({
        label,
        at: { ...body(0, 0), position: new Vector3(0, 0, 20) },
      })),
    );
    labels.tick(EYE, true);
    expect(shown()).toHaveLength(0);
  });

  it("keeps a label off another labelled body's disc", () => {
    const [first, second] = [body(-10, 0), body(-9.4, 3.3)];
    const chosen = labelled([near("gov/govern"), near("memba/members")]);
    labels.show(chosen.map((label, at) => ({ label, at: at === 0 ? first : second })));
    labels.tick(EYE, true);
    const box = boxOf(labels, "gov/govern");
    const [x, y] = [SCREEN.width / 2 - 9.4 * 20, SCREEN.height / 2 - 3.3 * 20];
    expect(box.shown).toBe(true);
    expect(
      Math.hypot(Math.max(box.left - x, 0, x - box.right), Math.max(box.top - y, 0, y - box.bottom)),
    ).toBeGreaterThanOrEqual(20);
  });

  it("keeps a label out of the header's band, the top 9% of the window", () => {
    const box = one(labels, body(0, (SCREEN.height / 2 - 110) / 20));
    expect(box.shown).toBe(true);
    expect(box.top).toBeGreaterThanOrEqual(0.09 * SCREEN.height);
  });

  it("keeps a label out of the ticker's band, the window's last 34 px, though its body sits just under the window", () => {
    // Its pill above it would end 1,058 px down, in the ticker: hidden, for no other place is left.
    const box = one(labels, body(0, (SCREEN.height / 2 - (SCREEN.height + 20)) / 20));
    expect(box.shown && box.bottom > SCREEN.height - 34).toBe(false);
  });

  // The review of 7p (R3): agents, 33 px round at x 1,591 on the video's screen, stands under the rail's band; its pill slides left of the
  // band, still over its body, from the band the labels read off the window's width.
  it("slides a body's pill left of the rail's band at 1728 px wide, still over its body", () => {
    const [x, y, radius] = [1590.7, 873, 33.1];
    const box = one(labels, body((x - SCREEN.width / 2) / 20, (SCREEN.height / 2 - y) / 20, radius / 20));
    expect(box.shown).toBe(true);
    expect(box.right).toBeLessThanOrEqual(SCREEN.width - 149);
    expect(box.right).toBeGreaterThan(x - radius);
  });

  it("keeps a label out of the rail's band at 1728 px wide, and lets it stand there under 900 px, where there is no rail", () => {
    const wide = one(labels, body((1728 - 190 - SCREEN.width / 2) / 20, 0));
    expect(wide.shown).toBe(true);
    expect(wide.right).toBeLessThanOrEqual(1728 - 149);
    const narrow = { width: 899, height: SCREEN.height };
    const phone = new Labels(document, projector(undefined, narrow));
    const box = one(phone, body((899 - 190 - narrow.width / 2) / 20, 0));
    expect(box.shown).toBe(true);
    expect(box.right).toBeGreaterThan(899 - 149);
    phone.dispose();
  });
});

// ADR-0003 §2, 2b and 2e: each label names its world for the page's doors, and the Earth's says "Start here" to a newcomer, in place of its
// heat, on a larger pill measured as it is drawn; a hidden label takes no pointer, so none lies in wait over the page.
describe("the labels as doors", () => {
  // The larger Earth's class, its stylesheet's.
  const START = styles["start"] ?? "start";
  const earth = (): Label => ({
    id: "earth",
    kind: "earth",
    title: "Earth",
    count: "184 here",
    badge: "▲ 21% · 130/h",
    uncharted: false,
  });
  const slotOf = (id: string) => slots().find((slot) => slot.dataset["world"] === id);

  it("names the world each label stands for, and the next one a slot takes", () => {
    labels.show(labelled([near("gov/govern")]).map((label) => ({ label, at: body(0, 0) })));
    expect(slotOf("gov/govern")?.textContent).toContain("govern");
    const slot = slotOf("gov/govern");
    vi.advanceTimersByTime(200);
    labels.show(labelled([near("games/chess")]).map((label) => ({ label, at: body(0, 0) })));
    vi.advanceTimersByTime(200);
    expect(slotOf("games/chess")).toBe(slot);
    expect(slotOf("gov/govern")).toBeUndefined();
  });

  // F4526: any of a label's words changing writes them again: its heat alone, its uncharted state alone.
  it.each([
    ["its heat", { badge: "▲ 5%" }],
    ["its uncharted state", { uncharted: true }],
  ])("writes a label's words again when %s alone changes", (_, change) => {
    const label: Label = {
      id: "gov/govern",
      kind: "near",
      title: "govern",
      count: "3 here",
      badge: "",
      uncharted: false,
    };
    labels.show([{ label, at: body(0, 0) }]);
    vi.advanceTimersByTime(200);
    labels.show([{ label: { ...label, ...change }, at: body(0, 0) }]);
    vi.advanceTimersByTime(200);
    const slot = slotOf("gov/govern");
    expect(slot?.textContent).toContain("badge" in change ? "▲ 5%" : "govern");
    expect(slot?.classList.contains(styles["uncharted"] ?? "uncharted")).toBe("uncharted" in change);
  });

  it("names two worlds apart though their words are the same, two uncharted signals", () => {
    const signal = (id: string): Label => ({
      id,
      kind: "far",
      title: "Uncharted signal",
      count: "go and look",
      badge: "",
      uncharted: true,
    });
    labels.show([{ label: signal("a/one"), at: body(-8, 0) }]);
    vi.advanceTimersByTime(200);
    labels.show([{ label: signal("b/two"), at: body(-8, 0) }]);
    vi.advanceTimersByTime(200);
    expect(slotOf("b/two")).toBeDefined();
    expect(slotOf("a/one")).toBeUndefined();
  });

  it("says Start here in the Earth's label in place of its heat, while it is asked, and draws it so", () => {
    labels.show([{ label: earth(), at: body(0, 0), start: true }]);
    const slot = slotOf("earth");
    expect(words(slot)).toEqual(["Earth", "184 here", "Start here →"]);
    expect(slot?.classList.contains(START)).toBe(true);
    vi.advanceTimersByTime(200);
    labels.show([{ label: earth(), at: body(0, 0) }]);
    vi.advanceTimersByTime(200);
    expect(words(slot)).toEqual(["Earth", "184 here", "▲ 21% · 130/h"]);
    expect(slot?.classList.contains(START)).toBe(false);
  });

  it("measures the Earth's label as Start here draws it, and again as it takes back its size", () => {
    const width = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get");
    width.mockImplementation(function (this: HTMLElement) {
      return this.classList.contains(START) ? 260 : 150;
    });
    labels.show([{ label: earth(), at: body(0, 0), start: true }]);
    expect(statOf(labels).width).toBe(260);
    vi.advanceTimersByTime(200);
    labels.show([{ label: earth(), at: body(0, 0) }]);
    vi.advanceTimersByTime(200);
    expect(statOf(labels).width).toBe(150);
  });

  // The stylesheet takes the pointer from every label (labels.module.css); the script gives it back to a shown one alone.
  it("lets a shown label take the pointer, and gives it back as the label hides", () => {
    const taking = () => slots().filter((slot) => slot.style.getPropertyValue("pointer-events") === "auto");
    expect(taking()).toEqual([]);
    labels.show(labelled([near("gov/govern")]).map((label) => ({ label, at: body(0, 0) })));
    labels.tick(EYE, true);
    expect(taking()).toEqual(shown());
    expect(taking()).toHaveLength(1);
    labels.tick(EYE, false);
    expect(taking()).toEqual([]);
  });
});
