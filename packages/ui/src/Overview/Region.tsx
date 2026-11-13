import type { ReactNode } from "react";
import { Stack } from "../compositions/index.ts";
import styles from "./Region.module.css";

/** The container a plate's blocks narrow by, for a story that draws one of them outside a plate. */
export function Stage({ children }: { children: ReactNode }) {
  return <div className={styles["plate"]}>{children}</div>;
}

/** A named part of a Storybook page: a region its heading names, so a test finds it by role. */
export function Region({ name, children }: { name: string; children: ReactNode }) {
  return (
    <section aria-label={name}>
      <Stack>
        <h2>{name}</h2>
        {children}
      </Stack>
    </section>
  );
}
