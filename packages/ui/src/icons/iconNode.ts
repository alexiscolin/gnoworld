// An icon as a DOM node, for what is not React (space's name pills): drawn from the same glyphs as Icon, never copied, with its own
// attributes and the one icon class, so an icon looks the same in both.
import { Fragment, isValidElement, type ReactNode } from "react";
import { GLYPHS } from "./glyphs.tsx";
import styles from "./Icon.module.css";
import type { IconProps } from "./Icon.tsx";

const SVG = "http://www.w3.org/2000/svg";

// The glyph's shapes (paths, circles) made into `into`, a fragment's children in place.
function draw(node: ReactNode, into: Element): void {
  if (Array.isArray(node)) {
    for (const child of node as ReactNode[]) draw(child, into);
    return;
  }
  if (!isValidElement(node)) return;
  const { children, ...attributes } = node.props as { children?: ReactNode } & Record<string, string | number>;
  if (node.type === Fragment) {
    draw(children, into);
    return;
  }
  if (typeof node.type !== "string") return;
  const shape = document.createElementNS(SVG, node.type);
  for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, String(value));
  into.append(shape);
}

/** The icon `name`, `size` (s, m or l), as an SVG element hidden from assistive technology: the control around it carries the words. */
export function iconNode(name: keyof typeof GLYPHS, size: IconProps["size"] = "m"): SVGSVGElement {
  const svg = document.createElementNS(SVG, "svg");
  const attributes = { viewBox: "0 0 16 16", "aria-hidden": "true", fill: "none", stroke: "currentColor" };
  for (const [key, value] of Object.entries({
    ...attributes,
    "stroke-width": "1.5",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  }))
    svg.setAttribute(key, value);
  svg.setAttribute("class", styles["icon"] ?? "");
  svg.dataset["icon"] = name;
  svg.dataset["size"] = size;
  draw(GLYPHS[name], svg);
  return svg;
}
