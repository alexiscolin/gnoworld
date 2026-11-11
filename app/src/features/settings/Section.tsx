// One part of the settings: its title, and its settings a step under it and apart from each other; a rule over every part but the first.
// One setting reads as its name over a line in the muted tone, its control at the end (Setting).
import { Sidebar, Stack } from "@gnoworld/ui";
import type { ReactNode } from "react";
import styles from "./Settings.module.css";

export function Section({
  id,
  title,
  aside,
  children,
}: {
  id: string;
  title: string;
  /** A muted line at the title's end. */
  aside?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={styles["section"]}>
      <Stack space="xs">
        <Sidebar side="end" align="center">
          <h3 id={id}>{title}</h3>
          {aside === undefined ? null : <span className="meta">{aside}</span>}
        </Sidebar>
        <Stack space="m">{children}</Stack>
      </Stack>
    </section>
  );
}

interface SettingProps {
  name: ReactNode;
  line: ReactNode;
  /** Its control, at the row's end; under the words where the row is narrow. */
  children: ReactNode;
}

/** A setting's row: its name and its line at the start, its control at the end. */
export function Setting({ name, line, children }: SettingProps) {
  return (
    <Sidebar side="end" align="center">
      <Stack space="3xs">
        {name}
        {line}
      </Stack>
      {children}
    </Sidebar>
  );
}
