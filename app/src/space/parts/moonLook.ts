// One room's moon (D490): a rocky world of the product's own look pipeline (core's look and recipe, the generated program), seeded from the
// room's id, its program patched to fade in and out, to flare when its room speaks and to keep a little earthshine on its night side. Its maps are the shared ones.
import { asciiBytes, planetLook, planetRecipe, type Anchor } from "@gnoworld/core";
import type { BufferGeometry } from "three";
import { hashOf } from "../hash.ts";
import { createWorld, mapNamesOf } from "../planet/generated.ts";
import type { Planet as Drawn } from "../planet/planet.ts";
import type { Maps } from "./maps.ts";

// The bare worlds a moon is: grey, dark or rust, never a sea, an ice nor an air.
const KINDS: readonly Anchor[] = ["rocky", "rocky", "dark carbon", "desert"];
const HEAD = "uniform float moonAlpha, moonFlare;\n";

/** A moon's world for `room`, once the maps are in: its alpha and its flare are uniforms of its surface. */
export function moonOf(room: string, { maps, sphere }: Made): Drawn | undefined {
  const path = asciiBytes(`moon/${room}`);
  const anchor = KINDS[Math.floor(hashOf(room, 7) * KINDS.length)] ?? "rocky";
  const world = { look: planetLook(path, anchor), recipe: planetRecipe(path, anchor) };
  const set = maps.setOf(mapNamesOf(world));
  if (set === undefined) return undefined;
  const drawn = createWorld(world, set, sphere);
  const { surface } = drawn;
  surface.fragmentShader =
    HEAD +
    surface.fragmentShader
      .replace(
        "gl_FragColor = vec4(colour, 1.0);",
        "gl_FragColor = vec4(colour * (1.0 + moonFlare * 1.2) + albedo * 0.05, 1.0);",
      )
      .replace("#include <colorspace_fragment>", "#include <colorspace_fragment>\n  gl_FragColor.a = moonAlpha;");
  surface.transparent = true;
  Object.assign(surface.uniforms, { moonAlpha: { value: 0 }, moonFlare: { value: 0 } });
  drawn.group.visible = false;
  return drawn;
}

export interface Made {
  readonly maps: Maps;
  readonly sphere: BufferGeometry;
}
