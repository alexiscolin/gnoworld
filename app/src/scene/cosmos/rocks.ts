// The home's rocks (7p; Alexis, 2026-11-03, "roches d'ambiance"), in a chunk of their own the cosmos's labels ask once a look lays some: one
// draw of quads turned to the eye, each a dark rock of a ragged outline, lit low from the great star's side, its edge soft when near. They
// stand where the view laid them in space and slide with the eye, so the near ones move most; nothing here is a world.
import type { Point, Rock } from "@gnoworld/core";
import {
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  type Object3D,
} from "three";

const MOST = 8;

// A rock from 4 units off is soft over a third of its edge, from 12 or more crisp; its light comes from the great star, the way it was laid.
const VERTEX = /* glsl */ `
attribute vec3 aAt;
attribute vec3 aRock;
attribute vec3 aLight;
varying vec2 vPlace;
varying vec3 vRock;
varying vec3 vLight;
varying float vSoft;
void main() {
  vec4 at = modelViewMatrix * vec4(aAt, 1.0);
  vPlace = position.xy;
  vRock = aRock;
  vLight = normalize(mat3(viewMatrix) * aLight);
  vSoft = mix(0.05, 0.34, 1.0 - smoothstep(4.0, 12.0, -at.z));
  at.xy += position.xy * aRock.x;
  gl_Position = projectionMatrix * at;
}`;

// A ragged outline from three waves round it, turned by the rock's own turn; a dome under it, dented, lit low on its star's side with a dim
// night side and a warm rim where the light grazes it: low-key, never a flat disc.
const FRAGMENT = /* glsl */ `
varying vec2 vPlace;
varying vec3 vRock;
varying vec3 vLight;
varying float vSoft;
void main() {
  float reach = length(vPlace);
  float angle = atan(vPlace.y, vPlace.x) + vRock.z * 6.2832;
  float edge = 0.8 + 0.08 * sin(3.0 * angle) + 0.05 * sin(5.0 * angle + 1.7) + 0.03 * sin(11.0 * angle + 0.4);
  float alpha = 1.0 - smoothstep(edge - vSoft, edge, reach);
  if (alpha <= 0.0) discard;
  vec2 dome = vPlace / edge;
  float dent = 0.12 * sin(7.0 * dome.x + vRock.z * 9.0) * sin(6.0 * dome.y - vRock.z * 5.0);
  vec3 normal = normalize(vec3(dome, sqrt(max(1.0 - dot(dome, dome), 0.0)) + dent));
  float lit = max(dot(normal, vLight), 0.0);
  float rim = pow(1.0 - normal.z, 3.0) * max(dot(normalize(dome + 1.0e-4), normalize(vLight.xy + 1.0e-4)), 0.0);
  vec3 stone = mix(vec3(0.09, 0.075, 0.06), vec3(0.2, 0.17, 0.13), vRock.y);
  gl_FragColor = vec4(stone * (0.22 + 1.5 * lit) + vec3(0.9, 0.62, 0.36) * rim * 0.35, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Rocks {
  readonly #at: InstancedBufferAttribute;
  readonly #rock: InstancedBufferAttribute;
  readonly #light: InstancedBufferAttribute;
  readonly #geometry = new InstancedBufferGeometry();
  readonly #material: ShaderMaterial;
  readonly #places: Point[] = [];
  readonly mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>;

  /** In `parent`, whose origin is the eye. */
  constructor(parent: Object3D) {
    // A square from -1 to 1, each rock one instance of it; three's plane, never drawn itself.
    const square = new PlaneGeometry(2, 2);
    this.#geometry.setIndex(square.getIndex());
    this.#geometry.setAttribute("position", square.getAttribute("position"));
    [this.#at, this.#rock, this.#light] = ["aAt", "aRock", "aLight"].map((name) => {
      const each = new InstancedBufferAttribute(new Float32Array(3 * MOST), 3).setUsage(DynamicDrawUsage);
      this.#geometry.setAttribute(name, each);
      return each;
    }) as [InstancedBufferAttribute, InstancedBufferAttribute, InstancedBufferAttribute];
    this.#geometry.instanceCount = 0;
    this.#material = new ShaderMaterial({
      depthWrite: false,
      transparent: true,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
    });
    this.mesh = new Mesh(this.#geometry, this.#material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    parent.add(this.mesh);
  }

  /** Lays `rocks`, eight at most: none, and nothing draws. */
  lay(rocks: readonly Rock[]): void {
    const count = Math.min(rocks.length, MOST);
    this.#places.length = 0;
    for (let at = 0; at < count; at += 1) {
      const rock = rocks[at];
      if (rock === undefined) continue;
      this.#places.push(rock.place);
      this.#rock.setXYZ(at, rock.radius, rock.shade, rock.turn);
      this.#light.setXYZ(at, rock.toStar.x, rock.toStar.y, rock.toStar.z);
    }
    this.#geometry.instanceCount = this.#places.length;
    this.#rock.needsUpdate = true;
    this.#light.needsUpdate = true;
    this.mesh.visible = this.#places.length > 0;
  }

  /** A frame: each rock from the eye, `eye` on the stage. */
  tick(eye: Point): void {
    for (let at = 0; at < this.#places.length; at += 1) {
      const place = this.#places[at];
      if (place !== undefined) this.#at.setXYZ(at, place.x - eye.x, place.y - eye.y, place.z - eye.z);
    }
    this.#at.needsUpdate = true;
  }

  /** Off the stage, its buffers and program freed. */
  dispose(): void {
    this.mesh.removeFromParent();
    this.#geometry.dispose();
    this.#material.dispose();
  }
}
