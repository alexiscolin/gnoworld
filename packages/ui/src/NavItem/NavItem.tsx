import type { ReactNode } from "react";
import { Icon, type IconName } from "../icons/Icon.tsx";
import { Pressable } from "../Pressable.tsx";
import { Soon } from "../ComingSoon/ComingSoon.tsx";
import styles from "./NavItem.module.css";

interface Shared {
  /** Its words. */
  children: string;
  /** The item in view: the cream pill (docs/DESIGN-SYSTEM.md, "Colour"). */
  current?: boolean;
  /** A picture or an icon before the words. */
  lead?: ReactNode;
  /** What it holds unseen, outside its link so the link keeps its words for a name: a count at its end, or a dot when there
   * is no `count`; `said` is what assistive technology reads; `status`, a state (online) rather than something unseen, keeps the
   * item's words quiet. */
  badge?: { said: string; count?: string | undefined; status?: boolean } | undefined;
  /** A quiet fact at its end, before the badge: an icon and a figure (a room's people here), `said` for assistive technology. */
  meta?: { icon: IconName; value: string; said: string } | undefined;
}
/** `soon`: what is yet to come, greyed and inert, "Coming soon" under the pointer and the focus (as `ComingSoon`). */
export type NavItemProps = Shared &
  (
    | { href: string; onClick?: never; soon?: never }
    | { href?: never; onClick: () => void; soon?: never }
    | { href?: never; onClick?: never; soon: true }
    /** The one in view that has no address: marked current, with nothing to do. */
    | { href?: never; onClick?: never; soon?: never }
  );

// Whether the badge says something is unseen, not a state such as online.
const unseen = (badge: Shared["badge"]): boolean => badge !== undefined && badge.status !== true;

// What stands at the item's end: its quiet fact, then what it holds unseen.
function End({ meta, badge }: Pick<Shared, "meta" | "badge">) {
  return (
    <span className={styles["end"]}>
      {meta === undefined ? null : (
        <span className={["with-icon", styles["meta"]].join(" ")}>
          <Icon name={meta.icon} size="s" />
          <span aria-hidden="true">{meta.value}</span>
          <span className="visually-hidden">{meta.said}</span>
        </span>
      )}
      {badge === undefined ? null : (
        <span
          className={styles["badge"]}
          data-dot={badge.count === undefined ? "" : undefined}
          data-unseen={badge.status === true ? undefined : ""}
        >
          {badge.count === undefined ? null : <span aria-hidden="true">{badge.count}</span>}
          <span className="visually-hidden">{badge.said}</span>
        </span>
      )}
    </span>
  );
}

const nothing = () => undefined;

// The item's control: a link, a button that acts, or one to come, inert.
function Main({
  face,
  label,
  current,
  href,
  onClick,
  soon,
}: { face: ReactNode; label: string; current: boolean } & {
  href: string | undefined;
  onClick: (() => void) | undefined;
  soon: true | undefined;
}) {
  const look = {
    className: [styles["main"], "covers"].join(" "),
    "aria-current": current ? ("true" as const) : undefined,
  };
  if (soon === true)
    return (
      <Soon name={label} className={look.className}>
        {face}
      </Soon>
    );
  // With no address and no act it is the item in view: a button that does nothing.
  return (
    <Pressable href={href} onClick={onClick ?? nothing} {...look}>
      {face}
    </Pressable>
  );
}

/** An item of a column of places, the design's rooms and direct messages: a link, or a button that acts, on a pill that fills
 * cream when it is the one in view. */
export function NavItem({ children, current = false, lead, badge, meta, href, onClick, soon }: NavItemProps) {
  const face = (
    <>
      {lead === undefined ? null : <span className={styles["lead"]}>{lead}</span>}
      <span className="truncate">{children}</span>
    </>
  );
  // The whole pill is the link, its sides and its count too: ui's `covers`.
  return (
    <div
      className={["lit", "column-item", styles["item"]].join(" ")}
      data-nav-item=""
      data-current={current ? "" : undefined}
      data-unread={unseen(badge) ? "" : undefined}
      data-soon={soon === true ? "" : undefined}
    >
      <Main face={face} label={children} current={current} href={href} onClick={onClick} soon={soon} />
      {meta === undefined && badge === undefined ? null : <End meta={meta} badge={badge} />}
    </div>
  );
}
