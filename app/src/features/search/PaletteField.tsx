// The palette's field, the whole width of the row.
import { Field } from "@gnoworld/ui";
import { LIST_ID } from "./PlaceResults.tsx";
import type { usePalette } from "./usePalette.ts";

/** `listing` is the active row's place while the typed list is drawn, else undefined. */
export function PaletteField({
  palette,
  listing,
}: {
  palette: ReturnType<typeof usePalette>;
  listing: number | undefined;
}) {
  return (
    <Field
      kind="search"
      label="Search places, rooms and people"
      hideLabel
      placeholder="Where to? a place, #room, @person, /r/…"
      value={palette.query}
      onChange={palette.ask}
      combobox={{
        controls: listing === undefined ? undefined : LIST_ID,
        activedescendant: listing === undefined || listing < 0 ? undefined : `${LIST_ID}-${String(listing)}`,
      }}
    />
  );
}
