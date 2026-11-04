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
}

// The row's words: its title, and its subtitle and activity when it has them.
function Words({
  title,
  subtitle,
  activity,
  label,
}: {
  title: string;
  subtitle: string | undefined;
  activity: string | undefined;
  label: boolean;
}) {
  return (
    <Stack space="3xs">
      <span className={styles["title"]}>{title}</span>
      {subtitle === undefined ? null : <span className={label ? "label" : styles["subtitle"]}>{subtitle}</span>}
      {activity === undefined ? null : <span className={styles["activity"]}>{activity}</span>}
    </Stack>
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
}: RowProps) {
  const words = <Words title={title} subtitle={subtitle} activity={activity} label={subtitleLook === "label"} />;
  const led =
    lead === undefined ? (
      words
    ) : (
      <Sidebar space="xs">
        <span className={styles["lead"]}>{lead}</span>
        {words}
      </Sidebar>
    );
  const body =
    href === undefined ? (
      led
    ) : (
      <Anchor href={href} className={styles["link"]} aria-current={current ? "true" : undefined}>
        {led}
      </Anchor>
    );
  return (
    <div className={styles["row"]} data-look={look} aria-current={current && href === undefined ? "true" : undefined}>
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
