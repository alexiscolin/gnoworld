import { useState } from "react";
import { useEase } from "./useEase.ts";
import styles from "./compositions.module.css";
import { place, type Composed } from "./place.tsx";

export interface GridProps extends Composed {
  min?: "2xs" | "s" | "m" | "l";
  /** Twelve columns instead: each child is a Cell. */
  cols?: 12;
  /** A fixed arrangement instead of columns that fit. */
  template?: "icon-text-meta" | "text-meta" | "label-value" | "main-aside";
}

/** Columns as many as fit, each at least a column token wide; or twelve, or a named template. */
export function Grid({ min = "m", cols, template, ...rest }: GridProps) {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  useEase(root, cols !== undefined);
  const own =
    cols !== undefined
      ? { "data-cols": String(cols) }
      : template !== undefined
        ? { "data-template": template }
        : { "data-min": min };
  return place({ ...rest, className: styles["grid"], own, ref: setRoot });
}
