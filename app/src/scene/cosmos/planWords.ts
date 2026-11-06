// A Plan's names in the file's words (part 7v), for the Plan's chunk: each world's name as the page gives it, a link to its page where it
// has one, the site's own or a hand-made project's https address and nothing else, and who is here.
import { realmRoute, type Planned } from "@gnoworld/core";
import { RealmPath } from "@gnoworld/schemas";
import { isOwnPage } from "../../pagePath.ts";
import type { CosmosWorld, LabelSignals } from "./cosmosWorld.ts";

/** A Plan as its names show it: in the file's words, linked to the worlds' pages, who is here in each world. */
export type Named = Planned & { readonly here: ReadonlySet<string> };

/** What the file says of the worlds a Plan shows: their realms, who is here, their names. */
export interface Words {
  readonly worlds: readonly CosmosWorld[];
  readonly signals: LabelSignals | undefined;
}

// A project's own address: https, a host, no space; a world's: a page of the site's own. Any other is no link.
export const external = (href: string) => /^https:\/\/[^\s/?#@\\]+(?:[/?#]\S*)?$/.test(href);
export const linkable = (href: string | undefined): href is string =>
  href !== undefined && (external(href) || isOwnPage(href));
/** A world's page, its first realm's view, where the file's path is a realm's of gno.land; none for any other path. */
export const realmPage = (path: string | undefined) =>
  path !== undefined && RealmPath.safeParse(path).success ? realmRoute(path) : undefined;

/** `plan` in the file's `words`: a world's page where the Plan knows none, who is here, the name the page gives. */
export function namedOf(plan: Planned, { worlds, signals }: Words): Named {
  const pages = new Map(worlds.map(({ id, realms }) => [id, realmPage(realms[0]?.path)] as const));
  const links = new Map(
    plan.worlds.flatMap(({ id }) => {
      const href = plan.links.get(id) ?? pages.get(id);
      return href === undefined ? [] : [[id, href] as const];
    }),
  );
  const here = new Set(plan.worlds.filter(({ id }) => (signals?.present.get(id)?.here ?? 0) > 0).map(({ id }) => id));
  const names = new Map(plan.worlds.map(({ id }) => [id, signals?.names.get(id) ?? plan.names.get(id) ?? id]));
  return { ...plan, names, links, here };
}
