// Whether the reader saves data, the browser's word (the Network Information API's saveData; slice 4's 4g), apart
// from the players it gates.

/** Whether the reader asks to save data (a 2G link, ADR-0002 §8): then no player is offered. */
export function savesData(): boolean {
  if (typeof navigator === "undefined") return false;
  const connection: unknown = Reflect.get(navigator, "connection");
  if (typeof connection !== "object" || connection === null) return false;
  return (
    Reflect.get(connection, "saveData") === true ||
    /^(?:slow-)?2g$/.test(String(Reflect.get(connection, "effectiveType")))
  );
}
