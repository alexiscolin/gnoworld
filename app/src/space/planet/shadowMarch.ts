// The one ray march both programs cast their relief's shadows with: a few steps toward the sun over a height, as a ray above a curved
// ground, and the gate that keeps it to a low sun. The Earth and the Moon read their height map (surfaceShader.ts), a generated world its
// coarse relief (generatedShadows.ts); each says how many steps, how soft, and how a height is read at a point.

/** The share of the casting the sun's height leaves: all near the terminator, none past a third of the way up. */
export const LOW_SUN = /* glsl */ `
float lowSun(float lift) {
  return 1.0 - smoothstep(0.12, 0.3, lift);
}
`;

/** A function `name(direction, toSun, ground, span, ...)` of the share of the sun the relief leaves `direction`: `read(p)` the height at a
 * point `p` (in GLSL, with the extra parameters `extra`), `span` its relief in radii, `soft` how wide a shadow's edge in spans. */
export const shadowMarch = (
  name: string,
  { steps, soft, extra, read }: Record<"steps" | "soft" | "extra" | "read", string>,
): string => `
float ${name}(vec3 direction, vec3 toSun, float ground, float span${extra}) {
  float lift = dot(direction, toSun);
  vec3 away = toSun - direction * lift;
  float run = length(away);
  if (run < 0.0001) return 1.0;
  float tilt = max(lift * inversesqrt(max(1.0 - lift * lift, 0.01)), 0.02);
  float lit = 1.0;
  for (int i = 1; i <= ${steps}; i++) {
    float s = 0.06 * float(i * i) / ${steps}.0 / ${steps}.0;
    vec3 p = normalize(direction + away / run * s);
    float rise = (${read} - ground) * span - s * tilt - 0.5 * s * s;
    lit = min(lit, 1.0 - smoothstep(0.0, ${soft} * span * (1.0 + 3.0 * s), rise));
  }
  return lit;
}
`;
