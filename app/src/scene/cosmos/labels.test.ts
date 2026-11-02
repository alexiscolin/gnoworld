// @vitest-environment jsdom
import { chooseLabels, LABEL_SLOTS, PLACE, toScene, type Label, type LabelAsk } from "@gnoworld/core";
import { Vector3 } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Labels, type Projector } from "./labels.ts";

// The cosmos's labels on the page (ADR-0002 §9: HTML labels pooled, never made each frame; slice 7 §3: text only, off each other): eight
// elements made once, their words written as text ten times a second at most, each frame moving them beside their bodies.
const SCREEN = { width: 1728, height: 1080 };
const projector = (box?: { left: number; top: number; right: number; bottom: number }): Projector => {
  const spot = { x: 0, y: 0, radius: 0, depth: 0 };
  return {
    sight: { ...SCREEN, box },
    seen(at: Vector3, radius: number) {
      spot.x = SCREEN.width / 2 + at.x * 20;
      spot.y = SCREEN.height / 2 - at.y * 20;
      spot.radius = radius * 20;
      spot.depth = -at.z;
      return spot;
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
// The first label's place as the stats give it, every field a number.
const statOf = (stats: ReturnType<Labels["stats"]>, at = 0) => {
  const stat = stats[at];
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
    const stat = statOf(labels.stats());
    expect(stat.shown).toBe(true);
    expect(stat.left).toBeCloseTo(SCREEN.width / 2 - 200 - PLACE.stem * stat.scale, 6);
    expect(slots().filter((slot) => slot.style.opacity === "0")).toHaveLength(LABEL_SLOTS - 2);
  });

  it("writes on the page where the layout stands each label", () => {
    labels.show(labelled([near("gov/govern")]).map((label) => ({ label, at: body(-10, 0) })));
    labels.tick(EYE, true);
    const stat = statOf(labels.stats());
    const [slot] = shown();
    const [, left, top, scale] =
      /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\((-?[\d.]+)\)/.exec(slot?.style.transform ?? "") ?? [];
    expect(Number(left)).toBeCloseTo(stat.left, 1);
    expect(Number(top)).toBeCloseTo(stat.top, 1);
    expect(Number(scale)).toBeCloseTo(stat.scale, 2);
    expect(Number(slot?.style.opacity)).toBeCloseTo(stat.fade, 2);
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
    expect(keeping.stats().filter(({ shown: on }) => on)).toHaveLength(2);
    for (const stat of keeping.stats().filter(({ shown: on }) => on)) {
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
    const [nearStat, farStat] = [statOf(labels.stats()), statOf(labels.stats(), 1)];
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
