// The info panel's second figure and its links out (the video's frame 56): how many countries those here declared (none declared
// draws none), and the place on gnoweb, the explorer and the docs.
import type { Line } from "@gnoworld/core";
import { Cluster, Icon } from "@gnoworld/ui";
import { countriesHere } from "./Country.tsx";
import { Figure } from "./Figure.tsx";
import styles from "./PlaceInfo.module.css";

export function CountriesFigure({ lines, members }: { lines: readonly Line[]; members: readonly string[] }) {
  const count = new Set(countriesHere(lines, members).values()).size;
  return count === 0 ? null : <Figure value={count} caption={count === 1 ? "Country" : "Countries"} />;
}

// Where gno.land's explorer and its documentation are: the prototype's own links (docs/prototype/source/app.js, linksFor).
const EXPLORER = "https://gnoscan.io";
const DOCS = "https://docs.gno.land";

/** The place's links out, each opening in a new tab: the place on gnoweb (its realm's page, else gnoweb itself), the explorer, the docs. */
export function Links({ gnoweb }: { gnoweb: string | undefined }) {
  const links = [
    ...(gnoweb === undefined ? [] : [{ label: "View on gnoweb", href: gnoweb }]),
    { label: "Explorer", href: EXPLORER },
    { label: "Docs", href: DOCS },
  ];
  return (
    <Cluster as="ul" space="xs">
      {links.map(({ label, href }) => (
        <li key={label}>
          <a href={href} target="_blank" rel="noopener noreferrer" className="label">
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
