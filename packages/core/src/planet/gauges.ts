// A world's gauges (ADR-0002 §10): the callers its realms count and a share. Tier 1 (docs/REVIEW.md).
import { clamp01 } from "../space/smooth.ts";

/** The callers a worlds' file counts in a world's realms, its realm use; a realm whose callers it does not count adds none. */
export const callersIn = (realms: readonly { readonly callers: number | null }[]): number =>
  realms.reduce((sum, { callers }) => sum + (callers ?? 0), 0);

/** `value` as a share, NaN counting for nothing. */
export const share = (value: number): number => clamp01(value) || 0;
