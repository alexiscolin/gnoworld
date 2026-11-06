// Where the Sun stands over the Earth at an instant, so the globe's day and night are the real ones. The Astronomical Almanac's low-precision
// formulas, good to about 0.01° from 1950 to 2050, and the Earth Rotation Angle for the hour: the two differ from the true sidereal time by
// the precession, a third of a degree today, which nothing drawn can show.

export interface GroundPoint {
  /** In radians, north positive. */
  readonly latitude: number;
  /** In radians, east positive. */
  readonly longitude: number;
}

const DAY_MS = 86_400_000;
// The Unix epoch, in days after noon of 2000-01-01, the almanac's J2000.
const J2000 = -10_957.5;
const RADIAN = Math.PI / 180;
const TURN = Math.PI * 2;

/** An angle in radians, brought within half a turn either way. */
export const within = (angle: number): number => {
  const wrapped = angle % TURN;
  if (wrapped > Math.PI) return wrapped - TURN;
  return wrapped <= -Math.PI ? wrapped + TURN : wrapped;
};

/** The point of the Earth with the Sun straight overhead at `epochMs`. */
export function subSolarPoint(epochMs: number): GroundPoint {
  const days = epochMs / DAY_MS + J2000;
  const mean = (280.46 + 0.9856474 * days) * RADIAN;
  const anomaly = (357.528 + 0.9856003 * days) * RADIAN;
  const ecliptic = mean + (1.915 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly)) * RADIAN;
  const obliquity = (23.439 - 0.0000004 * days) * RADIAN;
  const ascension = Math.atan2(Math.cos(obliquity) * Math.sin(ecliptic), Math.cos(ecliptic));
  const rotation = TURN * (0.779057273264 + 1.00273781191135448 * days);
  return {
    latitude: Math.asin(Math.sin(obliquity) * Math.sin(ecliptic)),
    longitude: within(ascension - rotation),
  };
}

/** A place's direction from the Earth's centre: north on y, Greenwich on x, the east turning right-handed about the pole, towards -z. */
export function groundDirection({ latitude, longitude }: GroundPoint): readonly [number, number, number] {
  const across = Math.cos(latitude);
  return [across * Math.cos(longitude), Math.sin(latitude), -across * Math.sin(longitude)];
}
