// A nebula image's sheets (ADR-0002 §10, "Space views"): quads turned to the eye in one draw, each cut from the image, bent by a slow field,
// softened by its layer and recoloured towards the mood, added to what is behind them and behind every body.
import { NEBULA_LAYERS, NEBULAE_MOST } from "@gnoworld/core";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  Mesh,
  ShaderMaterial,
  type Texture,
} from "three";
import type { Disposer } from "../disposer.ts";
import { FIELD } from "../planet/chunks.ts";

// The most an image draws: every nebula kept, each with all its layers.
const SHEETS = NEBULAE_MOST * NEBULA_LAYERS.length;
const CORNERS = [-1, -1, 1, -1, 1, 1, -1, 1];
const QUAD = [0, 1, 2, 0, 2, 3];

// A sheet with no light is folded out of the view, so it costs no fragment; a lit one stands behind every body.
const VERTEX = /* glsl */ `
attribute vec2 aCorner;
attribute vec4 aSheet;
attribute vec4 aWindow;
attribute vec4 aLight;
varying vec2 vCorner;
varying vec4 vWindow;
varying vec4 vLight;
varying vec2 vSoft;
void main() {
  vec4 at = modelViewMatrix * vec4(position, 1.0);
  float c = cos(aSheet.y);
  float s = sin(aSheet.y);
  at.xy += mat2(c, s, -s, c) * aCorner * aSheet.x;
  vCorner = aCorner;
  vWindow = aWindow;
  vLight = aLight;
  vSoft = aSheet.zw;
  gl_Position = aLight.a > 0.0 ? projectionMatrix * at : vec4(2.0, 2.0, 2.0, 1.0);
  gl_Position.z = gl_Position.w * 0.99999;
}`;

// The image bent by a slow field, cut to a soft uneven round, its level kept, its own hue and the mood's both softened towards grey: a
// telescope's colours, never pushed.
const FRAGMENT = /* glsl */ `
uniform sampler2D uImage;
varying vec2 vCorner;
varying vec4 vWindow;
varying vec4 vLight;
varying vec2 vSoft;
${FIELD}
void main() {
  float reach = length(vCorner);
  vec3 bend = field(vec3(vCorner * 1.4, vSoft.y));
  float edge = (1.0 - smoothstep(0.25, 0.95, reach + 0.3 * bend.z)) * (1.0 - smoothstep(0.85, 1.0, reach));
  vec2 at = vec2(0.5) + vec2(0.5, -0.5) * (vCorner + 0.1 * bend.xy);
  vec3 image = texture2D(uImage, vWindow.xy + at * vWindow.zw, vSoft.x).rgb;
  float level = dot(image, vec3(0.2126, 0.7152, 0.0722));
  vec3 own = mix(vec3(level), image, 0.7);
  vec3 tint = mix(vec3(1.0), vLight.rgb, 0.7);
  vec3 colour = mix(own, tint * level * 1.3, 0.55) * smoothstep(0.02, 0.3, level);
  gl_FragColor = vec4(colour * edge * edge * vLight.a * 0.75, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export interface Sheets {
  readonly mesh: Mesh<BufferGeometry, ShaderMaterial>;
  readonly image: { value: Texture | null };
  /** Where each stands from the eye; its half-width, turn, blur and warp seed; its window; its colour and light. Four vertices a sheet. */
  readonly position: BufferAttribute;
  readonly sheet: BufferAttribute;
  readonly window: BufferAttribute;
  readonly light: BufferAttribute;
  /** Each sheet's nebula, in the field's list, and its layer. */
  readonly of: Int16Array;
  readonly layer: Int8Array;
  count: number;
  fade: number;
}

function dynamic(geometry: BufferGeometry, name: string, items: number): BufferAttribute {
  const attribute = new BufferAttribute(new Float32Array(SHEETS * 4 * items), items);
  attribute.setUsage(DynamicDrawUsage);
  geometry.setAttribute(name, attribute);
  return attribute;
}

/** An image's sheets, hidden and empty, owned by `owner`. */
export function sheetsOf(owner: Disposer): Sheets {
  const geometry = owner.add(new BufferGeometry());
  const corners = new Float32Array(SHEETS * 8);
  const index = new Uint16Array(SHEETS * 6);
  for (let at = 0; at < SHEETS; at += 1) {
    corners.set(CORNERS, at * 8);
    index.set(
      QUAD.map((corner) => corner + at * 4),
      at * 6,
    );
  }
  geometry.setAttribute("aCorner", new BufferAttribute(corners, 2));
  geometry.setIndex(new BufferAttribute(index, 1));
  geometry.setDrawRange(0, 0);
  const image = { value: null };
  const material = owner.add(
    new ShaderMaterial({
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
      uniforms: { uImage: image },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
    }),
  );
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  return {
    mesh,
    image,
    position: dynamic(geometry, "position", 3),
    sheet: dynamic(geometry, "aSheet", 4),
    window: dynamic(geometry, "aWindow", 4),
    light: dynamic(geometry, "aLight", 4),
    of: new Int16Array(SHEETS),
    layer: new Int8Array(SHEETS),
    count: 0,
    fade: 0,
  };
}
