// The rail's footprint (core's RAIL), which the labels keep clear: the rail's width, and the credits' under it. A module of its own, so the
// credits, on every page with space, never pull the rail's own chunk in.
import { RAIL } from "@gnoworld/core";
import type { CSSProperties } from "react";

export const FOOTPRINT = { "--_footprint": `${String(RAIL.footprint)}px` } as CSSProperties;
