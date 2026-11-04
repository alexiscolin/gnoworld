// The workshop's tuning panel (docs/DEVELOPMENT.md, "The workshop"), on both lab pages: T shows it. Its sliders set the scene's values
// through the registry (src/scene/tuning.ts), live on the real renderer; its colours and sizes are the design system's custom properties,
// set on :root's own style, with no product code touched. "Copy" lists what changed, to land in code; "Reset" puts back the code's.
import { TUNABLES, tunedDefaults, type Tunable } from "../src/scene/tuning.ts";
import { colourControl, fontControl, lengthControl, primitives, sceneControl, type Control } from "./controls.ts";

// The labels' names and figures, and their padding: the lab's text.
const FONTS = ["--font-ui", "--font-data"];
const LENGTHS = ["--space-2xs", "--space-xs"];
// What a control hears stays with it: the pages' keys, drags and wheels move views.
const KEPT = ["keydown", "keyup", "pointerdown", "pointermove", "pointerup", "wheel"];

const made = <K extends keyof HTMLElementTagNameMap>(tag: K, text = "") =>
  Object.assign(document.createElement(tag), { textContent: text });

function section(title: string, controls: readonly (Control | undefined)[], kept: Control[]): HTMLFieldSetElement {
  const set = made("fieldset");
  set.append(made("legend", title));
  for (const control of controls)
    if (control !== undefined) {
      set.append(control.row);
      kept.push(control);
    }
  return set;
}

// A page that is not secure has no clipboard, and the list stays to select.
function copyOut(text: string, said: HTMLElement): void {
  said.textContent = "";
  Promise.resolve()
    .then(() => navigator.clipboard.writeText(text))
    .then(
      () => {
        said.textContent = "Copied.";
      },
      () => {
        said.textContent = "This page has no clipboard: select the list.";
      },
    );
}

// The scene's values the page's code has read so far, each once, in the registry's order: a cosmos reads its eye's lean once it stands.
interface SceneRows {
  readonly scene: HTMLFieldSetElement;
  readonly controls: Control[];
  readonly shown: Set<Tunable>;
}
function readInto({ scene, controls, shown }: SceneRows, drawn: () => void): void {
  const defaults = tunedDefaults();
  for (const name of TUNABLES) {
    const own = defaults.get(name);
    if (own === undefined || shown.has(name)) continue;
    shown.add(name);
    const control = sceneControl(name, own, drawn);
    scene.append(control.row);
    controls.push(control);
  }
}

/** The panel on this page, hidden until T; `drawn` asks the page for a frame after each change. */
export function tuningPanel(drawn: () => void): void {
  const aside = Object.assign(made("aside"), { hidden: true });
  aside.setAttribute("aria-label", "Tuning");
  for (const name of KEPT)
    aside.addEventListener(name, (event) => {
      event.stopPropagation();
    });
  const [scenes, tokens] = [[] as Control[], [] as Control[]];
  const scene = section("Scene", [], scenes);
  const list = Object.assign(made("output"), { className: "changed" });
  list.setAttribute("aria-label", "Changed values");
  const [said, copy, reset] = [made("p"), made("button", "Copy"), made("button", "Reset")];
  copy.addEventListener("click", () => {
    const lines = [...scenes, ...tokens].map((control) => control.line()).filter((line) => line !== undefined);
    list.textContent = lines.length === 0 ? "Nothing changed." : lines.join("\n");
    if (lines.length > 0) copyOut(list.textContent, said);
  });
  reset.addEventListener("click", () => {
    for (const control of [...scenes, ...tokens]) control.reset();
    list.textContent = "";
    drawn();
  });
  const colours = Array.from(document.styleSheets).flatMap((sheet) => primitives(sheet.cssRules));
  const sizes = [
    ...FONTS.map((name) => fontControl(name, drawn)),
    ...LENGTHS.map((name) => lengthControl(name, drawn)),
  ];
  const actions = made("nav");
  actions.append(copy, reset);
  aside.append(
    made("h2", "Tuning"),
    scene,
    section(
      "Colours",
      colours.map((name) => colourControl(name, drawn)),
      tokens,
    ),
    section("Sizes", sizes, tokens),
    actions,
    list,
    said,
  );
  const rows: SceneRows = { scene, controls: scenes, shown: new Set() };
  addEventListener(
    "keydown",
    ({ key }) => {
      if (key !== "t") return;
      readInto(rows, drawn);
      aside.hidden = !aside.hidden;
    },
    { capture: true },
  );
  document.body.append(aside);
}
