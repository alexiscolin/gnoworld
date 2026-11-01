import { describe, expect, it } from "vitest";
import { groundDirection, subSolarPoint, type GroundPoint } from "./sun.ts";

const radians = (degrees: number) => (degrees * Math.PI) / 180;
const degrees = (angle: number) => (angle * 180) / Math.PI;
const instant = (iso: string) => Date.parse(iso);
const place = (latitude: number, longitude: number): GroundPoint => ({
  latitude: radians(latitude),
  longitude: radians(longitude),
});
const PARIS = place(48.86, 2.35);
const SYDNEY = place(-33.87, 151.21);
const NORTH_POLE = place(90, 0);
const SOUTH_POLE = place(-90, 0);

// Above the horizon where this is positive: the terminator is where it is zero.
const sunlight = (where: GroundPoint, iso: string) => {
  const [x, y, z] = groundDirection(where);
  const [sunX, sunY, sunZ] = groundDirection(subSolarPoint(instant(iso)));
  return x * sunX + y * sunY + z * sunZ;
};

describe("subSolarPoint", () => {
  // The instants of 2026's equinox and solstices, as the almanacs give them to the minute.
  it.each([
    ["the March equinox", "2026-03-20T14:46:00Z", 0],
    ["the June solstice", "2026-06-21T08:24:00Z", 23.44],
    ["the December solstice", "2026-12-21T20:50:00Z", -23.44],
  ])("stands over the right latitude at %s", (_, iso, latitude) => {
    expect(degrees(subSolarPoint(instant(iso)).latitude)).toBeCloseTo(latitude, 1);
  });

  // The sun runs late of the clock in February and early in November: the two extremes of the equation of time.
  it.each([
    ["mid-February, about 14 minutes late, east of Greenwich", "2026-02-11T12:00:00Z", 3.5],
    ["early November, about 16 minutes early, west of it", "2026-11-03T12:00:00Z", -4.1],
  ])("stands near Greenwich at noon in %s", (_, iso, longitude) => {
    expect(Math.abs(degrees(subSolarPoint(instant(iso)).longitude) - longitude)).toBeLessThan(0.5);
  });

  it("goes west with the hours: a quarter of the way round in six", () => {
    const noon = degrees(subSolarPoint(instant("2026-11-03T12:00:00Z")).longitude);
    const later = degrees(subSolarPoint(instant("2026-11-03T18:00:00Z")).longitude);
    expect(later).toBeCloseTo(noon - 90, 0);
  });

  it("keeps a longitude within one turn, whatever the instant", () => {
    for (const iso of [
      "1970-01-01T00:00:00Z",
      "2000-01-01T12:00:00Z",
      "2026-11-03T23:59:59Z",
      "2099-12-31T06:00:00Z",
    ]) {
      const { longitude } = subSolarPoint(instant(iso));
      expect(longitude).toBeGreaterThan(-Math.PI - 1e-9);
      expect(longitude).toBeLessThanOrEqual(Math.PI + 1e-9);
    }
  });
});

// Worked out apart from this code: Kepler's equation on JPL's mean elements, with the true pole (the review's script, 2026-11-02). The code's
// longitude stands 0.34° east of it, by design: that is the precession between the Earth Rotation Angle and the sidereal time in 2026.
const PRECESSION = 0.34;
const NEAR = 0.02;

describe("subSolarPoint, against a reckoning of another kind", () => {
  it.each([
    ["2026-02-11T12:00:00Z", -13.9245, 3.5479],
    ["2026-03-20T14:46:00Z", 0.0014, -39.6453],
    ["2026-06-21T08:24:00Z", 23.4358, 54.4474],
    ["2026-11-03T12:00:00Z", -15.149, -4.1121],
    ["2026-12-21T20:50:00Z", -23.4358, -132.9397],
  ])("agrees at %s to a fiftieth of a degree", (iso, latitude, longitude) => {
    const point = subSolarPoint(instant(iso));
    expect(Math.abs(degrees(point.latitude) - latitude)).toBeLessThan(NEAR);
    expect(Math.abs(degrees(point.longitude) - PRECESSION - longitude)).toBeLessThan(NEAR);
  });
});

describe("day and night from the terminator", () => {
  it("lights Paris and leaves Sydney dark at noon on Greenwich", () => {
    expect(sunlight(PARIS, "2026-06-21T12:00:00Z")).toBeGreaterThan(0.5);
    expect(sunlight(SYDNEY, "2026-06-21T12:00:00Z")).toBeLessThan(-0.5);
  });

  it("does the reverse twelve hours on", () => {
    expect(sunlight(PARIS, "2026-06-21T00:00:00Z")).toBeLessThan(0);
    expect(sunlight(SYDNEY, "2026-06-21T00:00:00Z")).toBeGreaterThan(0);
  });

  it("keeps the north dark all round the December solstice, and the south lit", () => {
    for (const hour of ["00", "06", "12", "18"]) {
      expect(sunlight(NORTH_POLE, `2026-12-21T${hour}:00:00Z`)).toBeLessThan(0);
      expect(sunlight(SOUTH_POLE, `2026-12-21T${hour}:00:00Z`)).toBeGreaterThan(0);
    }
  });

  it("puts the terminator on the poles at an equinox", () => {
    expect(Math.abs(sunlight(NORTH_POLE, "2026-03-20T14:46:00Z"))).toBeLessThan(0.002);
  });
});

describe("groundDirection", () => {
  it("is a unit vector, wherever the place", () => {
    for (const where of [PARIS, SYDNEY, NORTH_POLE, place(-12, -170)])
      expect(Math.hypot(...groundDirection(where))).toBeCloseTo(1, 12);
  });

  it("puts the north up, Greenwich on x, and the east on the right of a reader who looks at Greenwich from outside", () => {
    expect(groundDirection(place(90, 0))[1]).toBeCloseTo(1, 12);
    const [x, y, z] = groundDirection(place(0, 0));
    expect([x, y, z].map((value) => Math.abs(value))).toEqual([1, 0, 0]);
    // Looking at +x from outside, down -x, with y up: the right hand is -z.
    expect(groundDirection(place(0, 90))[2]).toBeCloseTo(-1, 12);
  });
});
