// The home's first screen's aiming tag (D459, D540): a name pill of the world labels' family, a step larger, on a fine leader to a ring on the
// Earth's lit limb: "Earth" and one live fact the hero already reads, left out while unknown. It links to the Earth.
import { Cluster, grouped, Icon } from "@gnoworld/ui";
import { Link } from "react-router";
import type { PresencePeople } from "@gnoworld/schemas/indexer";
import { enterTag } from "../features/universe/arrival.ts";
import place from "./globe.module.css";

export function AimTag({ to, people }: { to: string; people: PresencePeople | undefined }) {
  // Out of sight at once; it rises with the page's words once the flight has landed (arrival.ts).
  const wait = (tag: HTMLAnchorElement | null) => {
    if (tag !== null) enterTag(tag);
  };
  const here = people?.online;
  return (
    <Link
      ref={wait}
      to={to}
      className={`placed nowrap pill-ends no-underline hit ${String(place["tag"])}`}
      data-tag=""
      aria-label="Earth, open its page"
    >
      <Cluster space="xs">
        <b className={place["name"]}>Earth</b>
        {here === undefined || here === 0 ? null : (
          <span className="label with-icon nowrap">
            <Icon name="people" size="s" />
            {grouped(here)}
          </span>
        )}
        <span className={`with-icon ${String(place["go"])}`}>
          Visit
          <Icon name="arrow" size="s" />
        </span>
      </Cluster>
    </Link>
  );
}
