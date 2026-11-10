// Every planet far out, as the demo draws them (D401): a quad turned to the eye, on which the GPU traces a true sphere, never under
// 2.4 px across, on its orbit by the clock; its colours are its generated look's, graded as the generated planet is, so the hand-over
// to the planet itself, once it is a few pixels across, shows nothing.
import { INTRO } from "../intro.ts";

const NOISE = /* glsl */ `
float h13(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h13(i), h13(i + vec3(1.0, 0.0, 0.0)), f.x), mix(h13(i + vec3(0.0, 1.0, 0.0)), h13(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(h13(i + vec3(0.0, 0.0, 1.0)), h13(i + vec3(1.0, 0.0, 1.0)), f.x), mix(h13(i + vec3(0.0, 1.0, 1.0)), h13(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.02 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
`;

/** How far a lens dims a planet or a sun it does not light (D425), as its light comes (uLens, 0 to 1). */
export const LENS_DIM = "mix(1.0, 0.15, uLens * (1.0 - aLit))";

/** How whole the galaxy's view is, 0 to 1 (uDisc, uHeart): the eye 2.05 of the disc's radii or more from the heart, none within one. */
export const GALAXY_VIEW = "smoothstep(uDisc, uDisc * 2.05, distance(cameraPosition, uHeart))";

/** How far a world's arrival has come (intro.ts), 0 to 1, eased out: its clock `uIntro` less its own `aDelay`, over INTRO.each. */
export const INTRO_SHARE = `(1.0 - pow(1.0 - clamp((uIntro - aDelay) / ${INTRO.each.toFixed(2)}, 0.0, 1.0), 3.0))`;

export const FACING = /* glsl */ `
void facing(vec3 c, out vec3 right, out vec3 up) {
  vec3 toCam = normalize(cameraPosition - c);
  vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  right = normalize(cross(camUp, toCam));
  up = cross(toCam, right);
}
`;

export const PLANETS_VERTEX = /* glsl */ `
attribute vec3 aCentre; attribute vec3 aAcross; attribute vec3 aAlong; attribute vec4 aOrbit; attribute vec4 aLow; attribute vec4 aHigh; attribute float aShown;
attribute float aLit; attribute float aReach; attribute float aDelay; uniform float uIntro; uniform float uTime; uniform float uPxK; uniform float uAlone; uniform float uSolo; uniform float uSoloPx; uniform float uBoost; uniform float uFeat[6];
uniform float uLens; uniform float uDisc; uniform vec3 uHeart;
varying vec3 vOff; varying vec3 vC; varying float vR; varying vec3 vSun; varying vec3 vAxis; varying vec3 vAcross; varying vec3 vAlong;
varying vec4 vLow; varying vec4 vHigh; varying float vSpin; varying float vDim; varying float vScale; varying float vIntro;
${FACING}
void main() {
  float a = aOrbit.y + aOrbit.z * uTime;
  vec3 c = aCentre + (aAcross * cos(a) + aAlong * sin(a)) * aOrbit.x;
  float d = distance(cameraPosition, c);
  // On a page its planet stands alone: every other one shrinks away as the page comes (uSolo, 0 to 1), the sphere with its quad, so it
  // stays round to the last; on the home only those large on screen (uSoloPx), the far ones staying behind the Earth as points.
  // On the home's first screen up to three worlds are drawn larger, each its own size (uFeat: an index and a boost, three times; uBoost less 1
  // the share shown), so the layers differ in size as in depth (D549).
  float boost = 1.0;
  for (int i = 0; i < 3; i++) if (abs(float(gl_InstanceID) - uFeat[i * 2]) < 0.5) boost = uFeat[i * 2 + 1];
  vScale = 1.0 + (boost - 1.0) * max(uBoost - 1.0, 0.0);
  float rad = aOrbit.w * vScale;
  float leaves = uSoloPx > 0.0 ? smoothstep(uSoloPx * 0.6, uSoloPx, rad / (uPxK * d)) : 1.0;
  float alone = abs(float(gl_InstanceID) - uAlone) < 0.5 ? 1.0 : 1.0 - uSolo * leaves;
  // From the galaxy's view a system's planets show once it spans 50 to 90 px (pick.ts aims at them past 70) or they near a pixel, so a
  // swarm never shows from afar; within the disc, as ever.
  float apart = max(smoothstep(50.0, 90.0, aReach / (uPxK * distance(cameraPosition, aCentre))), smoothstep(0.45, 1.2, rad / (uPxK * d)));
  vIntro = ${INTRO_SHARE};
  float r = max(rad, 1.2 * uPxK * d) * alone * mix(1.0, apart, ${GALAXY_VIEW}) * (0.35 + 0.65 * vIntro);
  // The quad stands square to the screen, never to the planet's own direction, and the sphere is traced straight on in it: a world far
  // off the view's axis stays a round disc, where a ray through its pixel stretched it (D510).
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 w = c + (right * position.x + up * position.y) * r * 1.02 * aShown;
  vOff = w - c; vC = c; vR = r; vSun = aCentre; vAcross = aAcross; vAlong = aAlong; vAxis = normalize(cross(aAcross, aAlong));
  vLow = aLow; vHigh = aHigh;
  vSpin = uTime * (0.03 + 0.05 * aLow.w) + aLow.w * 6.2831853;
  vDim = ${LENS_DIM};
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;

export const PLANETS_FRAGMENT = /* glsl */ `
uniform mat4 projectionMatrix; uniform float uTime;
varying vec3 vOff; varying vec3 vC; varying float vR; varying vec3 vSun; varying vec3 vAxis; varying vec3 vAcross; varying vec3 vAlong;
varying vec4 vLow; varying vec4 vHigh; varying float vSpin; varying float vDim; varying float vScale; varying float vIntro;
${NOISE}
vec3 surface(vec3 lp, float seed, float kind) {
  if (kind > 1.5) {
    float f = fbm(lp * 1.9 + 4.0);
    vec3 ground = mix(vec3(0.03, 0.09, 0.2), vec3(0.12, 0.2, 0.08), smoothstep(0.52, 0.56, f));
    return mix(ground, vec3(0.9), smoothstep(0.55, 0.8, fbm(lp * 3.2 + vec3(uTime * 0.004, 0.0, 0.0))) * 0.7);
  }
  float f = fbm(lp * 2.4 + seed);
  if (kind < 0.5) {
    // A gas giant as photographed (D513): many soft low-contrast bands of three widths, their edges rippled by turbulence, a fine streaked
    // grain along them, the poles a little darker; never a few dark stripes.
    float lat = lp.y + (f - 0.5) * 0.09 + 0.025 * (vnoise(lp * vec3(3.0, 14.0, 3.0) + seed) - 0.5);
    float bands = 0.5 * sin(lat * 9.0 + seed) + 0.3 * sin(lat * 17.0 + seed * 2.0) + 0.2 * sin(lat * 31.0 + seed * 3.0);
    float grain = vnoise(lp * vec3(4.0, 26.0, 4.0) + seed);
    return mix(vLow.rgb, vHigh.rgb, 0.5 + 0.26 * bands) * (0.9 + 0.2 * grain) * (1.0 - 0.18 * lp.y * lp.y);
  }
  return mix(vLow.rgb, vHigh.rgb, smoothstep(0.38, 0.68, f)) * (0.8 + 0.4 * vnoise(lp * 18.0 + seed));
}
void main() {
  vec3 back = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]); vec3 rd = -back;
  float perp2 = dot(vOff, vOff); float perp = sqrt(perp2);
  float cov = clamp((vR - perp) / max(fwidth(perp), 1e-6) + 0.5, 0.0, 1.0);
  if (cov <= 0.0 || vIntro <= 0.0) discard;
  vec3 hit = vC + vOff + back * sqrt(max(vR * vR - perp2, 0.0));
  vec3 n = normalize(hit - vC);
  vec4 clip = projectionMatrix * viewMatrix * vec4(hit, 1.0);
  gl_FragDepth = clamp(clip.z / clip.w * 0.5 + 0.5, 0.0, 1.0);
  float ndl = dot(n, normalize(vSun - hit));
  float cs = cos(vSpin); float sn = sin(vSpin); float px = dot(n, vAcross); float pz = dot(n, vAlong);
  vec3 lp = vec3(px * cs - pz * sn, dot(n, vAxis), px * sn + pz * cs);
  // Drawn larger on the home's first screen (uBoost, D541), a world is shaded as the Earth is: a terminator that falls across the disc, the
  // limb darker, the air a brighter rim (D543).
  float rich = smoothstep(1.0, 1.4, vScale);
  float mu = max(dot(n, -rd), 0.0);
  vec3 lit = surface(lp, vLow.w * 37.0, vHigh.w) * (0.02 + 1.1 * mix(smoothstep(-0.04, 0.2, ndl), smoothstep(-0.25, 0.85, ndl), rich));
  lit *= mix(1.0, 0.5 + 0.5 * pow(mu, 0.5), rich);
  float fres = pow(1.0 - mu, 3.0);
  lit += vec3(0.74, 0.7, 1.0) * fres * (0.08 + 0.9 * smoothstep(-0.25, 0.35, ndl)) * (0.6 + 0.7 * rich);
  gl_FragColor = vec4(lit * vDim, cov * vIntro);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
