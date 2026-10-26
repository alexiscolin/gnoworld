import { Address } from "@gnoworld/schemas";
import { shortAddress } from "./names.ts";

// A person: a guest by its nick, said so; an account's address shortened, its whole in its title; another name
// whole (the moderation bot's).
export function Person({ name, guest }: { name: string; guest: boolean }) {
  if (guest) return <span>{name} (guest)</span>;
  return Address.safeParse(name).success ? <span title={name}>{shortAddress(name)}</span> : <span>{name}</span>;
}
