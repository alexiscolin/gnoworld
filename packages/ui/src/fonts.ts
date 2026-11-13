// The two latin variable faces every page uses, as the bundler names them (the same files styles.css's @font-face asks for), so a page's
// head can preload them: the other subsets stay unfetched thanks to their unicode-range.
import mono from "@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2?url";
import text from "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url";

export const LATIN_FONTS: readonly string[] = [text, mono];
