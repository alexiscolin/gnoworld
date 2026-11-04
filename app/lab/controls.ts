// The tuning panel's controls (panel.ts): a slider for each scene value the registry holds (src/scene/tuning.ts), a colour picker for each
// primitive of the palette and a slider for each size token, both set on :root's own style. Each knows the line it gives "Copy" once
// changed, and its way back to the code's value.
import { setTuned, type Tunable } from "../src/scene/tuning.ts";

interface Span {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}
/** One control: its row, what it says when changed, and its way back to the code's value. */
export interface Control {
  readonly row: HTMLElement;
  readonly line: () => string | undefined;
  readonly reset: () => void;
}

const SCENE: Record<Tunable, Span & { readonly label: string; readonly where: string }> = {
  "grade.exposure": { label: "Exposure", min: 0.2, max: 2.5, step: 0.01, where: "app/src/scene/renderer.ts, EXPOSURE" },
  "eye.lean": { label: "Lean at home", min: 0, max: 8, step: 0.05, where: "packages/core/src/space/drift.ts, LEAN" },
  "eye.arrivalLean": {
    label: "Lean at a system",
    min: 0,
    max: 4,
    step: 0.02,
    where: "packages/core/src/space/drift.ts, ARRIVAL_LEAN",
  },
};
const TOKENS = "packages/ui/src/tokens.css";
const FONT_SPAN: Span = { min: 8, max: 32, step: 0.5 };
const LENGTH_SPAN: Span = { min: 0, max: 64, step: 1 };
const REM = /(\d*\.?\d+)rem/;
const PX = /^(\d*\.?\d+)px$/;
const HEX = /^#[0-9a-f]{6}$/;

const root = document.documentElement;
const token = (name: string) => getComputedStyle(root).getPropertyValue(name).trim();
// A colour as the picker takes it, whatever form a minifier gave the sheet (#fff, red): a 2D context writes an opaque one as #rrggbb.
const paint = document.createElement("canvas").getContext("2d");
const hexOf = (colour: string) => {
  if (paint === null) return colour;
  paint.fillStyle = "#000001";
  paint.fillStyle = colour;
  return paint.fillStyle;
};

/** The palette's primitives as the design system's sheet declares them on :root, in its order: every colour token is one, or a mix of one. */
export function primitives(rules: CSSRuleList): string[] {
  const found: string[] = [];
  for (const rule of rules) {
    if (rule instanceof CSSStyleRule && rule.selectorText === ":root")
      found.push(...Array.from(rule.style).filter((name) => name.startsWith("--p-")));
    else if (rule instanceof CSSGroupingRule) found.push(...primitives(rule.cssRules));
  }
  return found;
}

// A slider at the code's value. One off the slider's steps (ARRIVAL_LEAN is 3 / 2.2) shows as the code has it, and only a move changes it.
function slider(name: string, { value, ...span }: Span & { readonly value: number }, moved: (value: number) => void) {
  const row = document.createElement("label");
  const input = Object.assign(document.createElement("input"), {
    type: "range",
    min: String(span.min),
    max: String(span.max),
    step: String(span.step),
  });
  input.setAttribute("aria-label", name);
  const shown = document.createElement("output");
  let touched = false;
  const back = () => {
    input.value = String(value);
    shown.textContent = String(Number(value.toFixed(4)));
    touched = false;
  };
  back();
  input.addEventListener("input", () => {
    shown.textContent = input.value;
    touched = true;
    moved(input.valueAsNumber);
  });
  row.append(name, input, shown);
  return { row, back, now: () => (touched ? input.valueAsNumber : value) };
}

export function sceneControl(name: Tunable, own: number, drawn: () => void): Control {
  const { label, where, ...span } = SCENE[name];
  const { row, now, back } = slider(label, { ...span, value: own }, (value) => {
    setTuned(name, value);
    drawn();
  });
  return {
    row,
    line: () => (now() === own ? undefined : `${name}: ${String(now())} (was ${String(own)}) · ${where}`),
    reset: () => {
      back();
      setTuned(name, undefined);
    },
  };
}

export function colourControl(name: string, drawn: () => void): Control | undefined {
  const own = hexOf(token(name));
  if (!HEX.test(own) || own === "#000001") return undefined;
  const row = document.createElement("label");
  const input = Object.assign(document.createElement("input"), { type: "color", value: own });
  input.setAttribute("aria-label", name);
  input.addEventListener("input", () => {
    root.style.setProperty(name, input.value);
    drawn();
  });
  row.append(name, input);
  return {
    row,
    line: () => (input.value === own ? undefined : `${name}: ${input.value} (was ${own}) · ${TOKENS}`),
    reset: () => {
      input.value = own;
      root.style.removeProperty(name);
    },
  };
}

/** A font token's size, in pixels on the slider and in rem in the code, the rest of its shorthand kept. */
export function fontControl(name: string, drawn: () => void): Control | undefined {
  const own = token(name);
  const size = REM.exec(own)?.[1];
  if (size === undefined) return undefined;
  const perRem = parseFloat(getComputedStyle(root).fontSize);
  const { row, now, back } = slider(name, { ...FONT_SPAN, value: Number(size) * perRem }, (px) => {
    root.style.setProperty(name, own.replace(REM, `${String(px / perRem)}rem`));
    drawn();
  });
  return {
    row,
    line: () => {
      const rem = now() / perRem;
      return rem === Number(size)
        ? undefined
        : `${name} size: ${String(rem)}rem (was ${String(Number(size))}rem) · ${TOKENS}`;
    },
    reset: () => {
      back();
      root.style.removeProperty(name);
    },
  };
}

/** A length token in pixels. */
export function lengthControl(name: string, drawn: () => void): Control | undefined {
  const own = token(name);
  const size = PX.exec(own)?.[1];
  if (size === undefined) return undefined;
  const { row, now, back } = slider(name, { ...LENGTH_SPAN, value: Number(size) }, (px) => {
    root.style.setProperty(name, `${String(px)}px`);
    drawn();
  });
  return {
    row,
    line: () => (now() === Number(size) ? undefined : `${name}: ${String(now())}px (was ${own}) · ${TOKENS}`),
    reset: () => {
      back();
      root.style.removeProperty(name);
    },
  };
}
