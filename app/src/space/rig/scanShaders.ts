// The scan's shell (scan.ts): a glare band at the latitude `uScan` has reached, and a grid of meridians and parallels every 15° where
// it has passed, added over the planet, brightest where it faces the eye; `uUndraw` takes the lines back along their length, the
// meridians to the equator, the parallels to the meridian that faces the eye (`uFace`, its longitude), till none is left.

export const SCAN_VERTEX = /* glsl */ `
varying vec3 vLocal;
varying float vFacing;
void main() {
  vLocal = normalize(position);
  vec4 seen = modelViewMatrix * vec4(position, 1.0);
  vFacing = max(dot(normalize(normalMatrix * normal), normalize(-seen.xyz)), 0.0);
  gl_Position = projectionMatrix * seen;
}`;

export const SCAN_FRAGMENT = /* glsl */ `
uniform float uScan;
uniform float uGrid;
uniform float uBand;
uniform float uUndraw;
uniform float uFace;
varying vec3 vLocal;
varying float vFacing;
float line(float x) {
  float width = min(fwidth(x), 0.3) * 1.3;
  return 1.0 - smoothstep(0.0, width, abs(fract(x + 0.5) - 0.5));
}
// What is left of a line at along, 0 at its middle and 1 at its ends, as the undraw takes it back.
float left(float along) {
  float end = 1.0 - uUndraw;
  return 1.0 - smoothstep(end - 0.04, end, along);
}
void main() {
  float lat = vLocal.y;
  float edge = mix(1.15, -1.15, uScan);
  float off = (lat - edge) / 0.1;
  float band = exp(-off * off) * uBand;
  float angle = atan(vLocal.z, vLocal.x);
  float lon = angle * (12.0 / 6.2831853);
  float height = asin(clamp(lat, -1.0, 1.0));
  float parallel = height * (12.0 / 3.1415927);
  float aside = abs(mod(angle - uFace + 3.1415927, 6.2831853) - 3.1415927) / 3.1415927;
  float lines = max(line(lon) * left(abs(height) / 1.5707963), line(parallel) * left(aside));
  float grid = lines * uGrid * smoothstep(edge - 0.02, edge + 0.08, lat);
  float light = (band * 0.9 + grid * 0.45) * (0.35 + 0.65 * vFacing);
  gl_FragColor = vec4(vec3(light), 1.0);
}`;
