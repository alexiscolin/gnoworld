// A hub's world (decision of 2026-11-01, 11): the world its first realm groups into, as the worlds' job groups it, so its page draws the
// planet the cosmos does; a hub with no realm is a world of its own, by its slug.
import { worldIdOf } from "@gnoworld/core";

export const hubWorldOf = ({
  slug,
  realms,
}: {
  readonly slug: string;
  readonly realms?: readonly string[] | undefined;
}) => (realms?.[0] === undefined ? slug : worldIdOf(realms[0]));
