// A world's page as its first realm's view (the search, the chat's worlds): where the file's path is a realm's of gno.land; none for any other.
import { realmRoute } from "@gnoworld/core";
import { RealmPath } from "@gnoworld/schemas";

/** A world's page, its first realm's view, where the file's path is a realm's of gno.land; none for any other path. */
export const realmPageHref = (path: string | undefined) =>
  path !== undefined && RealmPath.safeParse(path).success ? realmRoute(path) : undefined;
