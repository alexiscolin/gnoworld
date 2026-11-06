// AccountName with the page's own parts: the universe the page is in and the two chains the name is read on, from the data files.
// The default export of the one chunk the login's view loads once an account is logged in.
import { AccountName } from "./AccountName.tsx";
import { pageNames } from "./pageNames.ts";

interface InPageProps {
  account: string;
  /** The id of the universe the page is in; Onyx's, the default, for none. */
  universe: string | undefined;
  pill: string;
}

export default function InPage({ account, universe, pill }: InPageProps) {
  return <AccountName account={account} {...pageNames(universe)} pill={pill} />;
}
