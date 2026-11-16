// The info panel's second figure and its links out (the video's frame 56): how many countries those here declared (none declared
// draws none), and the place on gnoweb and the explorer.
import type { Line } from "@gnoworld/core";
import { Cluster, Icon } from "@gnoworld/ui";
import { GNOSCAN } from "../../lib/chain/explorer.ts";
import { NEW_TAB } from "../../lib/newTab.ts";
import { countriesHere } from "./Country.tsx";
import { Figure } from "./Figure.tsx";
import styles from "./PlaceInfo.module.css";

export function CountriesFigure({ lines, members }: { lines: readonly Line[]; members: readonly string[] }) {
  const count = new Set(countriesHere(lines, members).values()).size;
  return count === 0 ? null : <Figure value={count} caption={count === 1 ? "Country" : "Countries"} />;
}

/** The place's links out, each opening in a new tab: the place on gnoweb (its realm's page, else gnoweb itself) and the explorer; no docs link. */
export function Links({ gnoweb }: { gnoweb: string | undefined }) {
  const links = [
    ...(gnoweb === undefined ? [] : [{ label: "View on gnoweb", href: gnoweb }]),
    { label: "Explorer", href: GNOSCAN },
  ];
  return (
    <Cluster as="ul" space="xs">
      {links.map(({ label, href }) => (
        <li key={label}>
          <a href={href} {...NEW_TAB} className="label">
            <span className={styles["link"]}>
              {label}
              <Icon name="arrow-up-right" />
            </span>
          </a>
        </li>
      ))}
    </Cluster>
  );
}
