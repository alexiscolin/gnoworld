// A page's feed of one kind of stream event (the cards', the translations'): each event through its schema, one that fails dropped and
// said once, then into the store.
import { read } from "./read.ts";

export function eventFeed<T, What extends string>(
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } },
  what: What,
) {
  return (
    told: (events: readonly T[]) => void,
    log: (what: What) => void = () => {
      reportError(new Error(`verdicts: ${what}`));
    },
  ): ((data: unknown) => void) => {
    let said = false;
    return (data) => {
      const event = read(data, schema);
      if (event !== undefined) told([event]);
      else if (!said) {
        said = true;
        log(what);
      }
    };
  };
}
