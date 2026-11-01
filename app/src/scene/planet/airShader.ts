// The air: light scattered along each ray through a shell, not a painted rim, so a world lit from behind wears a thin ring of light and a
// sunset along its terminator. Eight steps, in the world's own radii; it covers little of the screen unless the world is close.

export const AIR_VERTEX = /* glsl */ `
varying vec3 vWorld;
varying vec3 vCentre;
varying float vOuter;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vCentre = modelMatrix[3].xyz;
  vOuter = length(modelMatrix[0].xyz);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const AIR_FRAGMENT = /* glsl */ `
uniform vec3 sun;
uniform vec3 rimColour;
uniform float rimThickness;
uniform float limbLight;
varying vec3 vWorld;
varying vec3 vCentre;
varying float vOuter;
const int STEPS = 8;
const float STRENGTH = 11.0;
const float GLARE = 0.8;

vec2 through(vec3 from, vec3 towards, float radius) {
  float b = dot(from, towards);
  float h = b * b - dot(from, from) + radius * radius;
  if (h < 0.0) return vec2(1.0e6, -1.0e6);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

void main() {
  vec3 centre = vCentre;
  float outer = 1.0 + rimThickness;
  float radius = vOuter / outer;
  vec3 eye = (cameraPosition - centre) / radius;
  vec3 ray = normalize((vWorld - centre) / radius - eye);
  vec2 shell = through(eye, ray, outer);
  vec2 ground = through(eye, ray, 1.0);
  float near = max(shell.x, 0.0);
  float far = ground.x > 0.0 ? min(shell.y, ground.x) : shell.y;
  float stride = max(far - near, 0.0) / float(STEPS);
  float scale = rimThickness * 0.26;
  vec3 scatter = rimColour * rimColour * STRENGTH;
  vec3 gathered = vec3(0.0);
  vec3 forward = vec3(0.0);
  float thick = 0.0;
  for (int i = 0; i < STEPS; i++) {
    vec3 at = eye + ray * (near + (float(i) + 0.5) * stride);
    float height = max(length(at) - 1.0, 0.0);
    float density = exp(-height / scale) * stride;
    thick += density;
    float past = mix(2.0, length(cross(at, sun)), smoothstep(0.08, -0.08, dot(at, sun)));
    float lit = smoothstep(1.0 - scale * 0.2, 1.0 + scale * 2.0, past);
    float toSun = max(through(at, sun, outer).y, 0.0);
    vec3 passed = exp(-scatter * (thick + exp(-height / scale) * toSun * 0.5));
    gathered += density * lit * passed;
    forward += density * lit * passed;
  }
  float cosine = dot(ray, sun);
  float rayleigh = 0.75 * (1.0 + cosine * cosine);
  float g2 = GLARE * GLARE;
  float mie = (1.0 - g2) / (12.566 * pow(1.0 + g2 - 2.0 * GLARE * cosine, 1.5));
  vec3 light = gathered * scatter * rayleigh + forward * mie * 5.0 * mix(vec3(1.0, 0.9, 0.78), rimColour, 0.35);
  if (limbLight > 0.0) {
    float along = -dot(eye, ray);
    vec3 nearest = eye + ray * along;
    float over = length(nearest) - 1.0;
    float band = smoothstep(-0.004, 0.006, over) * exp(-max(over, 0.0) / (rimThickness * 0.34));
    light += vec3(0.62, 0.8, 1.0) * band * limbLight * smoothstep(-0.1, 0.5, dot(normalize(nearest), sun));
  }
  float veil = 1.0 - exp(-dot(scatter, vec3(0.333)) * thick);
  gl_FragColor = vec4(light * 0.8, veil * 0.5 * min(dot(light, vec3(4.0)), 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
