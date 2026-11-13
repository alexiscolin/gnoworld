import { useState } from "react";
import { useEase } from "./useEase.ts";
import styles from "./compositions.module.css";
import { place, type Composed } from "./place.tsx";

export interface GridProps extends Composed {
  min?: "s" | "m";
  /** Twelve columns instead: each child is a Cell. */
  cols?: 12;
  /** A fixed arrangement instead of columns that fit. */
  template?: "icon-text-meta" | "text-meta" | "label-value";
}

/** Columns as many as fit, each at least a column token wide; or twelve, or a named template. A row's two templates are the
 * utility classes of their names, which a block's own row takes too (Disclosure's): one definition. */
export function Grid({ min = "m", cols, template, className, ...rest }: GridProps) {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  useEase(root, cols !== undefined);
  const own =
    cols !== undefined
      ? { "data-cols": String(cols) }
      : template !== undefined
        ? { "data-template": template }
        : { "data-min": min };
  const row = template === "icon-text-meta" || template === "text-meta" ? template : undefined;
  const classes = [row, className].filter((name) => name !== undefined);
  return place({
    ...rest,
    ...(classes.length > 0 ? { className: classes.join(" ") } : {}),
    composition: styles["grid"],
    own,
    ref: setRoot,
  });
}
