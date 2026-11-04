// A plate's links out (frames 40, 93): "VIEW ON GNOWEB ↗", "EXPLORER ↗", "DOCS ↗", in the label's capitals. Each address is the site's own
// (the data's gnoweb, the explorer and the docs), never a realm's words, so each opens in a tab of its own with no warning.
import { Cluster, Icon } from "@gnoworld/ui";
import styles from "./OutLinks.module.css";

export function OutLinks({ links }: { links: readonly { label: string; href: string | undefined }[] }) {
  const shown = links.flatMap(({ label, href }) => (href === undefined ? [] : [{ label, href }]));
  if (shown.length === 0) return null;
  return (
    <Cluster as="ul" space="m">
      {shown.map(({ label, href }) => (
        <li key={label}>
          <a className={`label nowrap ${String(styles["out"])}`} href={href} target="_blank" rel="noopener noreferrer">
            {label} <Icon name="arrow-up-right" />
          </a>
        </li>
      ))}
    </Cluster>
  );
}
