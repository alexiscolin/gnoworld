import type { ReactNode } from "react";
import { Stack } from "../compositions/index.ts";

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
