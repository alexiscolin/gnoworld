// The passport's stamps by day, as the app writes days, the first of a day shown and the rest one press away; and the stamps charted first.
import { Cluster, Kicker, ShowMore, Stack, Stamp } from "@gnoworld/ui";
import { useState } from "react";
import { dayName, utcDay } from "../../lib/days.ts";
import { Note } from "../../TabRow.tsx";
import { byDay, SHOWN, type StampView } from "./stamps.ts";

const UTC = { timeZone: "UTC" };

// A stamp's day as its mark says it: "4 Nov".
const markDay = (day: string, now: Date) => (day === "" ? "" : utcDay(new Date(`${day}T00:00:00Z`), now));

function StampOf({ stamp, now }: { stamp: StampView; now: Date }) {
  return (
    <Stamp
      seed={stamp.id}
      name={stamp.name}
      day={markDay(stamp.day, now)}
      system={stamp.system}
      icon={stamp.icon}
      gold={stamp.gold}
    />
  );
}

// A cluster of stamps, the first `SHOWN` and the rest one press away.
function Shelf({ stamps, now }: { stamps: readonly StampView[]; now: Date }) {
  const [all, setAll] = useState(false);
  const shown = all ? stamps : stamps.slice(0, SHOWN);
  return (
    <>
      <Cluster space="2xs">
        {shown.map((stamp) => (
          <StampOf key={stamp.id} stamp={stamp} now={now} />
        ))}
      </Cluster>
      {all || stamps.length <= SHOWN ? null : (
        <div>
          <ShowMore
            count={stamps.length - SHOWN}
            onMore={() => {
              setAll(true);
            }}
          />
        </div>
      )}
    </>
  );
}

function Day({ day, stamps, now }: { day: string; stamps: readonly StampView[]; now: Date }) {
  const words = day === "" ? "Earlier" : dayName(new Date(`${day}T00:00:00Z`), now, UTC);
  return (
    <Stack as="section" space="xs">
      <Kicker>{`${words} · ${String(stamps.length)} ${stamps.length === 1 ? "stamp" : "stamps"}`}</Kicker>
      <Shelf stamps={stamps} now={now} />
    </Stack>
  );
}

/** The stamps, newest day first. */
export function StampsTab({ stamps, now }: { stamps: readonly StampView[]; now: Date }) {
  return (
    <Stack space="m">
      <Note>
        A stamp for each world you open, the day you first open it. They stay on this device; export or clear them in
        the settings.
      </Note>
      {stamps.length === 0 ? (
        <Note>No stamp yet: visit a world and it stamps your passport.</Note>
      ) : (
        byDay(stamps).map(({ day, stamps: held }) => <Day key={day} day={day} stamps={held} now={now} />)
      )}
    </Stack>
  );
}

/** The stamps charted first, in gold. */
export function ChartedTab({ stamps, now }: { stamps: readonly StampView[]; now: Date }) {
  return (
    <Stack space="m">
      <Note>Worlds no one had opened on this device before you: you charted them. Their stamp is gold.</Note>
      {stamps.length === 0 ? <Note>No world charted first yet.</Note> : <Shelf stamps={stamps} now={now} />}
    </Stack>
  );
}
