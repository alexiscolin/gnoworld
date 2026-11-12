// A kept answer is read once for a line and for good: a list that draws its lines again asks the door nothing more. At most 200 are held.
import type { Result } from "../../lib/api/http.ts";

const HELD = 200;

export function memoSaid<T>(
  read: (room: string, msgid: string) => Promise<Result<T>>,
): (room: string, msgid: string) => Promise<Result<T>> {
  const held = new Map<string, Promise<Result<T>>>();
  return (room, msgid) => {
    const key = JSON.stringify([room, msgid]);
    const had = held.get(key);
    if (had !== undefined) return had;
    // A failure is read again next time: the line may be kept by then.
    const made = read(room, msgid).then((result) => {
      if (!result.ok) held.delete(key);
      return result;
    });
    held.set(key, made);
    for (const old of held.keys()) {
      if (held.size <= HELD) break;
      held.delete(old);
    }
    return made;
  };
}
