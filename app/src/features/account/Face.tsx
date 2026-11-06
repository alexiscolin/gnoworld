// The account's face on the menu's trigger: a chunk of its own, asked once logged in, so a guest's first screen holds no nebula.
import { shortAddress } from "@gnoworld/schemas";
import { Avatar } from "@gnoworld/ui";

export function Face({ address }: { address: string }) {
  return <Avatar address={address} name={shortAddress(address)} size="s" decorative />;
}
