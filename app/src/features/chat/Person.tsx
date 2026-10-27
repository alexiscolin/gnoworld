import { isAccount, shortAddress } from "./names.ts";

interface PersonProps {
  name: string;
  guest: boolean;
  account?: boolean;
}

// A person: a guest by its nick, said so; an account's address shortened, its whole in its title; another name
// whole (the moderation bot's). Whether the name is an address, read once by a caller that knows it.
export function Person({ name, guest, account }: PersonProps) {
  if (guest) return <span>{name} (guest)</span>;
  return (account ?? isAccount(name)) ? <span title={name}>{shortAddress(name)}</span> : <span>{name}</span>;
}
