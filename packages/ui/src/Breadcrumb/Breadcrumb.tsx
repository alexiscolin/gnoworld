import { Cluster } from "../compositions/index.ts";
import { Anchor } from "../link.tsx";
import styles from "./Breadcrumb.module.css";

export interface BreadcrumbProps {
  /** The navigation's name, for a screen reader: "You are here". */
  label: string;
  /** The trail, from the root to the current page: each step links, the last is the page itself. */
  items: { label: string; href?: string }[];
}

/** Where the page sits in the site: a labelled trail of links ending on the current page, which is no link. */
export function Breadcrumb({ label, items }: BreadcrumbProps) {
  if (items.length === 0) return null;
  const last = items.length - 1;
  return (
    <nav aria-label={label} className={styles["trail"]}>
      <Cluster as="ol" space="2xs">
        {items.map((item, index) => (
          <li key={item.href ?? item.label}>
            {index === last || item.href === undefined ? (
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
