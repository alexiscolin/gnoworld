/** The ids of the elements that describe a control, as `aria-describedby` reads them: the ones that exist, in order. */
export function ids(...parts: (string | undefined)[]): string {
  return parts.filter((part) => part !== undefined && part !== "").join(" ");
}
