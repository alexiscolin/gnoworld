// Whether the reader saves data, the browser's word (the Network Information API's saveData; slice 4's 4g), apart
// from the players it gates.

/** Whether the reader asks to save data (a 2G link, ADR-0002 §8): then no player is offered. */
export function savesData(): boolean {
  if (typeof navigator === "undefined") return false;
  const connection: unknown = Reflect.get(navigator, "connection");
  return typeof connection === "object" && connection !== null && Reflect.get(connection, "saveData") === true;
}
