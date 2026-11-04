import type { ReactNode } from "react";
import { Anchor } from "../link.tsx";
import styles from "./NavItem.module.css";

interface Shared {
  /** Its words. */
  children: string;
  /** The item in view: the cream pill (docs/DESIGN-SYSTEM.md, "Colour"). */
  current?: boolean;
  /** A picture or an icon before the words. */
  lead?: ReactNode;
  /** What it holds unseen, outside its link so the link keeps its words for a name: a count at its end, or a dot when there
   * is no `count`; `said` is what assistive technology reads. */
  badge?: { said: string; count?: string | undefined } | undefined;
}
export type NavItemProps = Shared & ({ href: string; onClick?: never } | { href?: never; onClick: () => void });

/** An item of a column of places, the video's rooms and direct messages: a link, or a button that acts, on a pill that fills
 * cream when it is the one in view. */
export function NavItem({ children, current = false, lead, badge, href, onClick }: NavItemProps) {
  const face = (
    <>
      {lead === undefined ? null : <span className={styles["lead"]}>{lead}</span>}
      <span className="truncate">{children}</span>
    </>
  );
  // The whole pill is the link, its sides and its count too (review 25 of 5q): ui's `covers`.
  return (
    <div className={styles["item"]} data-nav-item="" data-current={current ? "" : undefined}>
      {href === undefined ? (
        <button
          type="button"
          className={[styles["main"], "covers"].join(" ")}
          aria-current={current ? "true" : undefined}
          onClick={onClick}
        >
          {face}
        </button>
      ) : (
        <Anchor
          href={href}
          className={[styles["main"], "covers"].join(" ")}
          aria-current={current ? "true" : undefined}
        >
          {face}
        </Anchor>
      )}
      {badge === undefined ? null : (
        <span className={styles["badge"]} data-dot={badge.count === undefined ? "" : undefined}>
          {badge.count === undefined ? null : <span aria-hidden="true">{badge.count}</span>}
          <span className="visually-hidden">{badge.said}</span>
        </span>
      )}
    </div>
  );
}
