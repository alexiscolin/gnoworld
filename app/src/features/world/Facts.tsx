// A plate's facts (frames 26, 40, 92): who is here right now, and the messages an hour, as cells of the plate's grid (Here.tsx). Each one is
// drawn only when a source gives it: a fact with no source is left out, never a zero or a sample ("never a number without its source and age").
import { Stat } from "@gnoworld/ui";

// A source says a count when it gives a finite number of 0 or more; a rate is shown as a whole number, as the frames do.
const count = (given: number | undefined) =>
  given !== undefined && Number.isFinite(given) && given >= 0 ? Math.round(given) : undefined;

export function Facts({
  here,
  perHour,
  unit = "here",
  caption = "right now",
}: {
  here?: number | undefined;
  perHour?: number | undefined;
  unit?: string;
  caption?: string;
}) {
  const people = count(here);
  const rate = count(perHour);
  return (
    <>
      {people === undefined ? null : <Stat value={people} unit={unit} caption={caption} />}
      {rate === undefined ? null : <Stat value={rate} unit="/h" caption="messages now" />}
    </>
  );
}
