// The country a person declares (+gnoworld/country, 7j), shared by a line's head, who is here and the person card: its code to the
// eye, as the video's frames 56 and 76 draw it, its name to a reader and a screen reader. Any client may write anything there:
// what is no country draws nothing and counts for none.
import type { Line } from "@gnoworld/core";
import styles from "./RoomView.module.css";

const REGIONS = new Intl.DisplayNames("en", { type: "region", fallback: "none" });
// What the browser names and the table of countries does not: old codes, unions, test regions. The table stays out of these lines' chunk, every
// reader's, 3.8 KB for a title.
const NOT_COUNTRIES = "AC AN BU CP CQ CS DD DG DY EA EU EZ FX HV IC NH QO RH SU TA TP UK UN VD XA XB YD YU ZR ZZ";

/** A country's name in English, or none for a code that is no country. */
export const countryName = (code: string | undefined): string | undefined =>
  code === undefined || NOT_COUNTRIES.includes(code) ? undefined : REGIONS.of(code);

/** A country's code, named for a screen reader; nothing for no country. With `named`, its name after it too (who is here). */
export function Country({ code, named = false }: { code: string | undefined; named?: boolean }) {
  const name = countryName(code);
  if (name === undefined) return null;
  return (
    <>
      <span className={styles["country"]} title={name} data-line-country="">
        <span aria-hidden="true">{code}</span>
        {named ? null : <span className="visually-hidden">{name}</span>}
      </span>
      {named ? <span className={styles["countryName"]}>{name}</span> : null}
    </>
  );
}

/** The country each of `members` last declared in the room's lines, by nick; those who declared none are not in it. */
export function countriesHere(lines: readonly Line[], members: readonly string[]): ReadonlyMap<string, string> {
  const here = new Set(members);
  const declared = new Map<string, string>();
  for (const { from, country } of lines) {
    if (here.has(from) && countryName(country) !== undefined && country !== undefined) declared.set(from, country);
  }
  return declared;
}
