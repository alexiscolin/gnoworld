// Whether the reader saves data, the browser's word (the Network Information API's saveData; slice 4's 4g), apart
// from the players it gates.

/** Whether the reader asks to save data (a 2G link, ADR-0002 §8): then no player is offered. */
export function savesData(): boolean {
  if (typeof navigator === "undefined") return false;
  const connection: unknown = Reflect.get(navigator, "connection");
  if (typeof connection !== "object" || connection === null) return false;
  const link: unknown = Reflect.get(connection, "effectiveType");
  return Reflect.get(connection, "saveData") === true || link === "2g" || link === "slow-2g";
}

/** Whether the link is a fast one, where the browser says (the Network Information API's effectiveType; Wi-Fi or 4G): what is asked ahead of a
 * click, in a batch, waits for one. A browser that does not say is taken as fast; a reader who saves data never is. */
export function fastLink(): boolean {
  if (savesData()) return false;
  const connection: unknown = typeof navigator === "undefined" ? undefined : Reflect.get(navigator, "connection");
  if (typeof connection !== "object" || connection === null) return true;
  const link: unknown = Reflect.get(connection, "effectiveType");
  return link === undefined || link === "4g";
}
