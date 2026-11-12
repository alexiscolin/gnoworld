import { afterEach, describe, expect, it } from "vitest";
import { boosts } from "./boosts.ts";
import { layoutOf, placeOf } from "./layout.ts";
import type { Place } from "./place.ts";
import { shapeBoosts } from "./shape.ts";
import { latch } from "./vista.ts";

// A featured world keeps the boost it landed with on the home: leaving the home it shrinks by the frame's easing alone, never re-sized by
// the camera that flies away (the boost is measured from the camera only on the flight that lands on the home).
const universe = layoutOf([{ id: "bubble", namespace: "bubble", realms: [] }]);
const planet = universe.byId.get("bubble") ?? universe.earth;
const at = placeOf(planet, 0, { x: 0, y: 0, z: 0 });
const circle = { x: 640, y: 360, radius: 300, width: 1280, height: 720, free: { left: 0, right: 1280 } };
const spaceOf = (place: Place, flying: boolean, back: number) => ({
  place,
  circle,
  seconds: 0,
  rig: {
    flying,
    eye: { x: at.x, y: at.y, z: at.z + back },
    pose: { fov: 50, way: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 } },
  },
});

afterEach(() => {
  latch.featured = [];
  boosts.value.fill(-1);
  boosts.gate = 0;
});

describe("a featured world's boost", () => {
  it("is measured from the camera on the flight that lands on the home, and kept as the flight leaves it", () => {
    latch.featured = [{ planet, share: 0.135 }];
    boosts.gate = 0.5;
    shapeBoosts(spaceOf({ kind: "home" }, true, 10));
    const landed = boosts.value[1];
    shapeBoosts(spaceOf({ kind: "home" }, true, 20));
    const nearer = boosts.value[1];
    expect(nearer).not.toBe(landed);
    shapeBoosts(spaceOf({ kind: "universe" }, true, 40));
    expect(boosts.value[1]).toBe(nearer);
  });
});
