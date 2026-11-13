// The icons of the chat's messages beyond glyphs.tsx's size cap, drawn as the set's others: a 16 px grid, a 1.5 px stroke.
import type { ReactElement } from "react";

export type Glyph = ReactElement;

export const messageGlyphs = {
  "search-messages": (
    <>
      <path d="M2.5 2.5h11v8h-4.5l-3 3v-3h-3.5z" />
      <circle cx="7.3" cy="6" r="2" />
      <path d="M8.8 7.5l1.7 1.7" />
    </>
  ),
} satisfies Record<string, Glyph>;
