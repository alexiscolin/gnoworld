// The palette's field, the whole width of the row.
import { Field } from "@gnoworld/ui";
import type { usePalette } from "./usePalette.ts";

export function PaletteField({ palette }: { palette: ReturnType<typeof usePalette> }) {
  return (
    <Field
      kind="search"
      label="Search places"
      hideLabel
      placeholder="Where to? a place, #room, @namespace, /r/…"
      value={palette.query}
      onChange={palette.ask}
    />
  );
}
