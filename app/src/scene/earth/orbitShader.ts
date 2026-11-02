// The golden ring: a thin tube read from its own centre line, so it keeps its width on screen however the orbit leans, with a bright wake
// behind the Moon (frames 37 to 42). The glow is the Moon's halo. Both are added light.

export const ORBIT_VERTEX = /* glsl */ `
varying vec3 vNormal;
varying vec3 vToEye;
varying vec3 vCentre;
varying float vAlong;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vNormal = normalize(mat3(modelMatrix) * normal);
  vToEye = cameraPosition - world.xyz;
  vCentre = modelMatrix[3].xyz;
  vAlong = uv.x;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

// Where the ring goes behind the globe it fades over its last few degrees, for the limb's light and its own would meet in a white needle.
export const ORBIT_FRAGMENT = /* glsl */ `
uniform float head;
varying vec3 vNormal;
varying vec3 vToEye;
varying vec3 vCentre;
varying float vAlong;
const float TAU = 6.28318530718;
void main() {
  vec3 ray = normalize(vToEye);
  float centred = max(dot(normalize(vNormal), ray), 0.0);
  float past = fract(vAlong - head / TAU);
  float wake = exp(-past * 2.2);
  float clearOfMoon = smoothstep(0.012, 0.02, min(past, 1.0 - past));
  vec3 toCentre = vCentre - cameraPosition;
  float along = dot(toCentre, -ray);
  float clear = length(toCentre + ray * along);
  float hidden = length(vToEye) > along ? 1.0 - smoothstep(1.0, 1.06, clear) : 0.0;
  vec3 amber = vec3(1.0, 0.56, 0.2) * (pow(centred, 40.0) * 0.6 + pow(centred, 8.0) * 0.12);
  vec3 core = vec3(1.0, 0.88, 0.7) * pow(centred, 300.0) * (2.2 + 0.5 * wake);
  #ifdef FINE
  amber = vec3(0.0);
  core *= 0.5;
  #endif
  gl_FragColor = vec4((amber + core) * (1.0 - hidden) * clearOfMoon, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const GLOW_VERTEX = /* glsl */ `
varying vec2 vPlace;
void main() {
  vPlace = uv * 2.0 - 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const GLOW_FRAGMENT = /* glsl */ `
varying vec2 vPlace;
void main() {
  float far = length(vPlace);
  float halo = exp(-far * 6.0) * 1.3 + exp(-far * 2.6) * 0.14;
  float light = halo * mix(0.1, 1.0, smoothstep(0.24, 0.3, far)) * (1.0 - smoothstep(0.5, 1.0, far));
  gl_FragColor = vec4(vec3(1.0, 0.74, 0.42) * light, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
