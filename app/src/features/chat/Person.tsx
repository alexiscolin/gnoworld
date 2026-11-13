import { GUEST_PREFIX, JARVIS_NICK } from "@gnoworld/core";
import { isAccount, shortAddress } from "./names.ts";

interface PersonProps {
  name: string;
  guest: boolean;
  account?: boolean;
}

// A person: a guest by its nick, said so, a guest who speaks through the bot (anon/<name>, D430) by its name; an account's address
// shortened, its whole in its title; another name whole (the moderation bot's). Whether the name is an address, read once by a caller.
export function Person({ name, guest, account }: PersonProps) {
  if (name === JARVIS_NICK) return <span>Jarvis (AI)</span>;
  if (guest) return <span>{name.startsWith(GUEST_PREFIX) ? name.slice(GUEST_PREFIX.length) : name} (guest)</span>;
  return (account ?? isAccount(name)) ? <span title={name}>{shortAddress(name)}</span> : <span>{name}</span>;
}
