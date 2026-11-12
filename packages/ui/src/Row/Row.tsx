import type { ReactNode } from "react";
import { Sidebar, Stack } from "../compositions/index.ts";
import { Anchor } from "../link.tsx";
import styles from "./Row.module.css";

export interface RowProps {
  title: string;
  subtitle?: string;
  /** In words what the 3D shows: "12 here now". */
  activity?: string;
  /** The subtitle in the one label style (mono caps), as a notification's place is (frames 86, 87); the meta line by default. */
  subtitleLook?: "meta" | "label";
  /** A picture, an icon or an avatar's slot, before the words. */
  lead?: ReactNode;
  /** A control or a mark after them. */
  trail?: ReactNode;
  look?: "plain" | "divided" | "boxed";
  current?: boolean;
  /** A link for the lead and the words; the trail stays out of it, so its controls are not inside a link. */
  href?: string;
  /** The link goes to another site: in a new tab, and the other site is told nothing of this one. */
  external?: boolean;
  /** The words cut at the end of the line, as a list of one-line rows has them. */
  truncate?: boolean;
  /** A button for the lead and the words (a row that does something here); `href` and `onClick` are never both. */
  onClick?: () => void;
}

// The row's words: its title, and its subtitle and activity when it has them.
function Words({
  title,
  subtitle,
  activity,
  label,
  truncate,
}: {
  title: string;
  subtitle: string | undefined;
  activity: string | undefined;
  label: boolean;
  truncate: boolean | undefined;
}) {
  return (
    <Stack space="3xs">
      <span className={[styles["title"], truncate === true ? "truncate" : ""].join(" ")}>{title}</span>
      {subtitle === undefined ? null : <span className={label ? "label" : styles["subtitle"]}>{subtitle}</span>}
      {activity === undefined ? null : <span className={styles["activity"]}>{activity}</span>}
    </Stack>
  );
}

// What the lead and the words are inside: a button, a link or nothing.
function Body({
  led,
  current,
  href,
  external,
  onClick,
}: {
  led: ReactNode;
  current: boolean;
  href: string | undefined;
  external: boolean | undefined;
  onClick: (() => void) | undefined;
}) {
  const now = current ? "true" : undefined;
  if (onClick !== undefined) {
    return (
      <button type="button" className={["full-start", styles["link"]].join(" ")} aria-current={now} onClick={onClick}>
        {led}
      </button>
    );
  }
  if (href === undefined) return led;
  return (
    <Anchor
      href={href}
      className={["full-start", styles["link"]].join(" ")}
      aria-current={now}
      {...(external === true ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {led}
    </Anchor>
  );
}

/** One line of a list: its lead, its words, its trail. */
export function Row({
  title,
  subtitle,
  activity,
  subtitleLook = "meta",
  lead,
  trail,
  look = "plain",
  current = false,
  href,
  external,
  truncate,
  onClick,
}: RowProps) {
  const words = (
    <Words title={title} subtitle={subtitle} activity={activity} label={subtitleLook === "label"} truncate={truncate} />
  );
  const led =
    lead === undefined ? (
      words
    ) : (
      <Sidebar space="xs">
        <span className={styles["lead"]}>{lead}</span>
        {words}
      </Sidebar>
    );
  const body = <Body led={led} current={current} href={href} external={external} onClick={onClick} />;
  return (
    <div
      className={styles["row"]}
      data-look={look}
      aria-current={current && href === undefined && onClick === undefined ? "true" : undefined}
    >
      {trail === undefined ? (
        body
      ) : (
        <Sidebar side="end" space="s">
          {body}
          <span>{trail}</span>
        </Sidebar>
      )}
    </div>
  );
}
