import type { CSSProperties } from "react";
import { Grid, Stack } from "../compositions/index.ts";
import { groups, tokens } from "../tokens.ts";
import { Region } from "../Overview/Region.tsx";
import styles from "./TokensPage.module.css";

// A private property set from a token's name: what each sample below reads.
function reads(property: `--_${string}`, name: string): CSSProperties {
  return { [property]: `var(${name})` };
}

/** What a token draws: a colour its swatch, a length its bar, a radius its corner, a type its letters. */
function Sample({ name }: { name: string }) {
  if (/^--(p|color)-/.test(name))
    return <span className={styles["swatch"]} data-swatch style={reads("--_swatch", name)} />;
  if (/^--(space|control|icon)-/.test(name))
    return <span className={styles["length"]} data-sample style={reads("--_length", name)} />;
  if (name.startsWith("--radius-"))
    return <span className={styles["corner"]} data-sample style={reads("--_radius", name)} />;
  if (name.startsWith("--font-")) {
    return (
      <span className={styles["type"]} data-sample style={reads("--_font", name)}>
        Ag
      </span>
    );
  }
  return null;
}

/** Every token of tokens.css, by group, read from the file itself (docs/DESIGN-SYSTEM.md, "Tokens"). */
export function TokensPage() {
  const all = tokens();
  return (
    <Stack space="xl">
      {groups().map((group) => (
        <Region key={group.name} name={group.name}>
          <Grid as="ul" min="s">
            {all
              .filter((token) => token.group === group.name)
              .map(({ name, value }) => (
                <li key={name} data-preview={name}>
                  <Stack space="2xs">
                    <Sample name={name} />
                    <code>{name}</code>
                    <small className={styles["value"]}>{value}</small>
                  </Stack>
                </li>
              ))}
          </Grid>
        </Region>
      ))}
    </Stack>
  );
}
