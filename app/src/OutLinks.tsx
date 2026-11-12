// A plate's links out (frames 40, 93): "VIEW ON GNOWEB ↗", "EXPLORER ↗", "DOCS ↗", in the label's capitals. Each address is the team's data
// (a station's site, https only, checked at build) or the site's own (the gnoweb, the explorer, the docs), never a realm's words, so each
// opens in a tab of its own with no warning.
import { Cluster, Icon } from "@gnoworld/ui";
import { NEW_TAB } from "./lib/newTab.ts";
import styles from "./OutLinks.module.css";

export function OutLinks({ links }: { links: readonly { label: string; href: string | undefined }[] }) {
  const shown = links.flatMap(({ label, href }) => (href === undefined ? [] : [{ label, href }]));
  if (shown.length === 0) return null;
  return (
    <Cluster as="ul" space="xl">
      {shown.map(({ label, href }) => (
        <li key={label}>
          <a className={`label ${String(styles["out"])}`} href={href} {...NEW_TAB}>
            <Cluster space="3xs">
              {label}
              <Icon name="arrow-up-right" />
            </Cluster>
          </a>
        </li>
      ))}
    </Cluster>
  );
}
