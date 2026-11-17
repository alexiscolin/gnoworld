// The phone sheet's one line of what is live here: who talks, who is here and how many countries, in words (a lone "0 / TALKING NOW"
// figure says less). What it is not told, or what is empty, is left out.
export function liveLine({
  talking,
  here,
  countries,
}: {
  talking: number | undefined;
  here: number | undefined;
  countries: number | undefined;
}): string {
  return [
    talking === undefined ? "" : talking === 0 ? "Nobody talking now" : `${String(talking)} talking now`,
    here === undefined || here === 0 ? "" : `${String(here)} here`,
    countries === undefined || countries === 0
      ? ""
      : `${String(countries)} ${countries === 1 ? "country" : "countries"}`,
  ]
    .filter((part) => part !== "")
    .join(" · ");
}
