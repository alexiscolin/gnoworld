import { worldOf } from "../rooms/rooms.ts";
import { EARTH } from "./chain.ts";

interface Budgets {
  perVisitor?: number;
  total?: number;
  earthTotal?: number;
}

// The streams open, by visitor and in all.
function slots(perVisitor: number, total: number) {
  const byVisitor = new Map<string, number>();
  let admitted = 0;
  return {
    free: (who: string): boolean => (byVisitor.get(who) ?? 0) < perVisitor && admitted < total,
    take(who: string): void {
      byVisitor.set(who, (byVisitor.get(who) ?? 0) + 1);
      admitted += 1;
    },
    release(who: string): void {
      admitted -= 1;
      const left = (byVisitor.get(who) ?? 1) - 1;
      if (left > 0) byVisitor.set(who, left);
      else byVisitor.delete(who);
    },
    visitors: (): number => byVisitor.size,
  };
}

// The chat's places and the Earth's apart: a stream that follows the Earth's room alone takes the Earth's.
// 32 an address is nginx's own limit (deploy/web/nginx.conf, `limit_conn open 32`), so a shared Wi-Fi is not turned away
// sooner than the proxy would; 2,000 in all is the online target (the load test's CROWD, docs/OPERATIONS.md).
export function admission({ perVisitor = 32, total = 2000, earthTotal = 2000 }: Budgets) {
  const chat = slots(perVisitor, total);
  const earth = slots(perVisitor, earthTotal);
  return {
    of: (rooms: Iterable<string>) => ([...rooms].every((room) => worldOf(room) === EARTH) ? earth : chat),
    visitors: (): number => chat.visitors() + earth.visitors(),
  };
}
