// The golden ring: a thin tube read from its own centre line, so it keeps its width on screen however the orbit leans, with a bright wake
// behind the Moon (frames 37 to 42). The glow is the Moon's halo. Both are added light.

export const ORBIT_VERTEX = /* glsl */ `
varying vec3 vNormal;
varying vec3 vToEye;
varying float vAlong;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vNormal = normalize(mat3(modelMatrix) * normal);
  vToEye = cameraPosition - world.xyz;
  vAlong = uv.x;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const ORBIT_FRAGMENT = /* glsl */ `
uniform float head;
varying vec3 vNormal;
varying vec3 vToEye;
varying float vAlong;
const float TAU = 6.28318530718;
void main() {
  float centred = max(dot(normalize(vNormal), normalize(vToEye)), 0.0);
  float wake = exp(-fract(vAlong - head / TAU) * 2.2);
  vec3 amber = vec3(1.0, 0.6, 0.24) * pow(centred, 3.0) * (0.24 + 0.46 * wake);
  vec3 core = vec3(1.0, 0.88, 0.68) * pow(centred, 38.0) * (0.55 + 4.0 * wake);
  gl_FragColor = vec4(amber + core, 1.0);
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
  float light = exp(-far * 7.0) * 1.6 * (1.0 - smoothstep(0.5, 1.0, far));
  gl_FragColor = vec4(vec3(1.0, 0.74, 0.42) * light, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
