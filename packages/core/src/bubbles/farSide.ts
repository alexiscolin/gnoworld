export interface LatLon {
  readonly lat: number;
  readonly lon: number;
}

const radians = (degrees: number): number => (degrees * Math.PI) / 180;
/** Rounding noise at the rim: the dot product of two points exactly a quarter round apart is zero, give or take this. */
const RIM = 1e-12;

/** Whether `point` is on the far side of a globe facing `facing`: more than a quarter of the way round (over 90 degrees
 * of arc). The rim itself shows. The cosine of the arc is the dot product of the two points as unit vectors. */
export function isFarSide(point: LatLon, facing: LatLon): boolean {
  const cosine =
    Math.sin(radians(point.lat)) * Math.sin(radians(facing.lat)) +
    Math.cos(radians(point.lat)) * Math.cos(radians(facing.lat)) * Math.cos(radians(point.lon - facing.lon));
  return cosine < -RIM;
}
