// Rings: wide, with gaps from one shared profile, in the world's shadow, brightening when lit from behind as thin ice does. Never the status
// ring, which is a thin tilted line with its moon (ADR-0002 §10).

export const RING_VERTEX = /* glsl */ `
varying vec3 vWorld;
varying vec3 vCentre;
varying float vRadius;
varying float vWorldRadius;
void main() {
  vRadius = length(position.xy);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vCentre = modelMatrix[3].xyz;
  vWorldRadius = length(modelMatrix[0].xyz);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const RING_FRAGMENT = /* glsl */ `
uniform sampler2D ringMap;
uniform vec3 sun;
uniform vec3 ringTint;
uniform float ringInner;
uniform float ringOuter;
uniform float ringOpacity;
varying vec3 vWorld;
varying vec3 vCentre;
varying float vRadius;
varying float vWorldRadius;
const float SHADED = 0.3;

void main() {
  float reach = (vRadius - ringInner) / (ringOuter - ringInner);
  // Past what a pixel can hold the fine lines go, or they beat against the pixels as they turn: a ring seen small is its smooth mean.
  float small = fwidth(reach);
  float fine = 0.5 + 0.3 * sin(reach * 61.0) * sin(reach * 23.0 + 1.3) * (1.0 - smoothstep(0.008, 0.03, small)) + 0.2 * sin(reach * 131.0 + 0.4) * (1.0 - smoothstep(0.002, 0.012, small));
  float density = texture2D(ringMap, vec2(reach, 0.5)).r * ringOpacity * (0.52 + 0.48 * fine);
  vec3 at = (vWorld - vCentre) / vWorldRadius;
  float past = dot(at, sun) < 0.0 ? length(cross(at, sun)) : 2.0;
  // The world's shadow dims the ring, never cuts it: the rest is what the ice scatters (a hole in a ring was a bug).
  float lit = mix(SHADED, 1.0, smoothstep(0.9, 1.1, past));
  vec3 view = normalize(cameraPosition - vWorld);
  float behind = smoothstep(0.1, 1.0, -dot(view, sun));
  vec3 colour = mix(ringTint, vec3(0.72, 0.68, 0.62), 0.45) * lit * (0.56 + behind * 1.1) * (0.74 + 0.5 * fine);
  gl_FragColor = vec4(colour * density, density);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
