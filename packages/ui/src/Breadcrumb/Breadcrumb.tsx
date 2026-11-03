import { Cluster } from "../compositions/index.ts";
import { Icon } from "../icons/Icon.tsx";
import { Anchor } from "../link.tsx";
import styles from "./Breadcrumb.module.css";

export interface BreadcrumbProps {
  /** The navigation's name, for a screen reader: "You are here". */
  label: string;
  /** The trail, from the root to the current page: each step links, or acts where a place is no page of its own (a system's view in the
   * cosmos), the last is the page itself. */
  items: { label: string; href?: string; onSelect?: () => void }[];
}

/** Where the page sits in the site: a labelled trail of links ending on the current page, which is no link. It is drawn as the
 * video's kicker: the one label style, a dot in the world's colour, the steps apart by a chevron. */
export function Breadcrumb({ label, items }: BreadcrumbProps) {
  if (items.length === 0) return null;
  const last = items.length - 1;
  return (
    <nav aria-label={label} className={["label", styles["trail"]].join(" ")}>
      <span className={["dot", styles["world"]].join(" ")} aria-hidden="true" />
      <Cluster as="ol" space="2xs">
        {items.map((item, index) => (
          <li key={item.href ?? item.label}>
            {index !== last && item.onSelect !== undefined ? (
              <button type="button" className={styles["back"]} onClick={item.onSelect}>
                <span className={styles["arrow"]} aria-hidden="true">
                  <Icon name="arrow" />
                </span>
                {item.label}
              </button>
            ) : index === last || item.href === undefined ? (
              <span aria-current={index === last ? "page" : undefined}>{item.label}</span>
            ) : (
              <Anchor href={item.href}>{item.label}</Anchor>
            )}
          </li>
        ))}
      </Cluster>
    </nav>
  );
}
