// The nebula's shaders (parts/nebula.ts): soft clouds on the sky's shell, a function of the direction alone, so nothing of it moves with
// the eye but its turn, nor on its own. Gold-white, blue-white, rose and teal patches, the galaxy's own tints (parts/haze.ts), laid by
// a warped fall of noise, a pixel's own noise under one level so it never bands.
import { DISC } from "../layout.ts";
import { UNGRADE } from "./glows.ts";

export const NEBULA_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * viewMatrix * vec4(cameraPosition + position * 20000.0, 1.0);
}`;

// The clouds as a function of the direction: laid once on a cube map (parts/nebula.ts), or run per pixel where that cannot be.
const CLOUDS = /* glsl */ `
float h13(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h13(i), h13(i + vec3(1.0, 0.0, 0.0)), f.x), mix(h13(i + vec3(0.0, 1.0, 0.0)), h13(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(h13(i + vec3(0.0, 0.0, 1.0)), h13(i + vec3(1.0, 0.0, 1.0)), f.x), mix(h13(i + vec3(0.0, 1.0, 1.0)), h13(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
vec3 cloudsAt(vec3 d) {
  vec3 warp = vec3(fbm(d * 1.3 + 3.0), fbm(d * 1.3 + 8.0), fbm(d * 1.3 + 13.0)) - 0.5;
  float cloud = smoothstep(0.38, 0.8, fbm(d * 2.1 + warp * 1.6));
  float wisp = smoothstep(0.3, 0.9, fbm(d * 4.3 + warp * 2.4));
  float tone = fbm(d * 0.9 + 21.0);
  vec3 tint = mix(vec3(1.0, 0.8, 0.58), vec3(0.58, 0.7, 1.0), smoothstep(0.3, 0.65, tone));
  tint = mix(tint, vec3(1.0, 0.6, 0.8), 0.45 * smoothstep(0.55, 0.8, fbm(d * 1.1 + 40.0)));
  tint = mix(tint, vec3(0.5, 0.9, 0.85), 0.4 * smoothstep(0.55, 0.8, fbm(d * 1.1 + 60.0)));
  return tint * (cloud * cloud * 0.17 + wisp * cloud * 0.07);
}`;

export const NEBULA_BAKE_FRAGMENT = /* glsl */ `
varying vec3 vDir;
${CLOUDS}
void main() { gl_FragColor = vec4(cloudsAt(normalize(vDir)), 1.0); }`;

const tail = (clouds: string): string => /* glsl */ `
uniform float uGain; uniform float uThrough; varying vec3 vDir;
${UNGRADE}
void main() {
  vec3 d = normalize(vDir);
  // Always there, a smooth fall with the distance from the heart to a third of its light in the galaxy's view: never toggled by a place.
  float inside = 1.0 - 0.7 * smoothstep(${DISC.toFixed(1)}, ${(DISC * 6).toFixed(1)}, length(cameraPosition));
  vec3 lit = ${clouds} * uGain * inside;
  float dither = (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5) / 255.0;
  // Through the flight's blur the frame is graded anew: written ungraded then, it shows the same in flight and at rest (D497).
  gl_FragColor = vec4(max((uThrough > 0.5 ? ungrade(lit) : lit) + dither, 0.0), 1.0);
}`;

/** One pass of noise per pixel: the clouds where a cube map of half floats cannot be drawn to. */
export const NEBULA_FRAGMENT = `${CLOUDS}${tail("cloudsAt(d)")}`;
/** A read of the baked cube. */
export const NEBULA_BAKED_FRAGMENT = `uniform samplerCube uClouds;${tail("textureCube(uClouds, d).rgb")}`;
