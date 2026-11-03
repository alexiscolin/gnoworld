// A frame copied once from the screen and laid over the stage, which shows through it as it fades: the dive's under reduced motion (7d7),
// where no camera moves and the whole cosmos, drawn still, fades into the view at rest. Its picture is the drawing buffer's size, and goes
// with it. A flight leaving a page lays one too (7g), and zooms it as the eye goes on through it.
import {
  BufferAttribute,
  BufferGeometry,
  FramebufferTexture,
  Mesh,
  ShaderMaterial,
  Vector2,
  type Scene as Stage,
  type WebGLRenderer,
} from "three";
// One triangle over the whole screen, drawn after everything else on the stage. The sky's own (sky.ts) stays its: an import of it from
// a lazy chunk splits the scene's chunk in two.
const CORNERS = new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]);
const OVER = 10;

export class Dissolve {
  readonly #stage: Stage;
  readonly #before: Stage["onAfterRender"];
  readonly #veil = { value: 1 };
  readonly #zoom = { value: 1 };
  readonly #picture: { value: FramebufferTexture | null } = { value: null };
  readonly #mesh: Mesh<BufferGeometry, ShaderMaterial>;
  #gone = false;

  constructor(stage: Stage) {
    this.#stage = stage;
    this.#before = stage.onAfterRender.bind(stage);
    stage.onAfterRender = this.#copy;
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(CORNERS, 3));
    this.#mesh = new Mesh(
      geometry,
      new ShaderMaterial({
        depthTest: false,
        depthWrite: false,
        transparent: true,
        toneMapped: false,
        uniforms: { uPicture: this.#picture, uVeil: this.#veil, uZoom: this.#zoom },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = position.xy * 0.5 + 0.5;
            gl_Position = vec4(position.xy, 0.0, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform sampler2D uPicture;
          uniform float uVeil;
          uniform float uZoom;
          varying vec2 vUv;
          void main() {
            gl_FragColor = vec4(texture2D(uPicture, (vUv - 0.5) / uZoom + 0.5).rgb, uVeil);
          }`,
      }),
    );
    this.#mesh.name = "dissolve";
    this.#mesh.frustumCulled = false;
    this.#mesh.renderOrder = OVER;
    this.#mesh.visible = false;
    stage.add(this.#mesh);
  }

  /** Whether the frame it stands for was copied. */
  get copied(): boolean {
    return this.#picture.value !== null;
  }

  /** How much of its picture shows. */
  get veil(): number {
    return this.#mesh.visible ? this.#veil.value : 0;
  }

  // The frame just drawn, as the screen holds it, graded and blended, copied once.
  readonly #copy = (renderer: WebGLRenderer): void => {
    this.#stage.onAfterRender = this.#before;
    const size = renderer.getDrawingBufferSize(new Vector2());
    const picture = new FramebufferTexture(size.x, size.y);
    renderer.copyFramebufferToTexture(picture);
    this.#picture.value = picture;
  };

  /** Shows `veil` of its picture over the stage, once it has one, `zoom` times as large about the screen's middle. */
  fade(veil: number, zoom = 1): void {
    this.#veil.value = Math.min(1, Math.max(0, veil));
    this.#zoom.value = zoom;
    this.#mesh.visible = this.copied && this.#veil.value > 0;
  }

  dispose(): void {
    if (this.#gone) return;
    this.#gone = true;
    if (this.#stage.onAfterRender === this.#copy) this.#stage.onAfterRender = this.#before;
    this.#mesh.visible = false;
    this.#mesh.removeFromParent();
    this.#mesh.geometry.dispose();
    this.#mesh.material.dispose();
    this.#picture.value?.dispose();
  }
}
