import type { IconName } from "../icons/Icon.tsx";
import { GLYPHS } from "../icons/glyphs.tsx";

/** Every glyph's name, for the pages that list them: the design system's overview and the icons' story. */
export const ICON_NAMES = Object.keys(GLYPHS) as IconName[];
