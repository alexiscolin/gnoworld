// The realm a world's plate shows the capture of (8f), apart from the previews' reader: the plate is on the first screen, and this rule
// costs it a few bytes where the reader would cost it its schema.
import type { UniverseView } from "../../places.ts";

/** The world's first realm, in the default universe alone, whose pages the server's job captures. */
export const platePreview = (
  realms: readonly string[] | undefined,
  universe: Pick<UniverseView, "isDefault">,
): string | undefined => (universe.isDefault ? realms?.[0] : undefined);
