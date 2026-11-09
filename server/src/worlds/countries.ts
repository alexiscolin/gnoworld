// The accounts whose declared country is kept, the last to speak kept: a country is two letters, so 100,000 of them weigh a few MB at most.
const DECLARED_MOST = 100_000;

// Each account's declared country by its name in lower case, as a nick is counted (Ergo's force-nick-equals-account): the last to speak
// kept, the oldest leaving when it is full; an older line (a history page) tells only of an account not yet heard.
export function makeCountries() {
  const countries = new Map<string, string>();
  return {
    of: (nick: string): string | undefined => countries.get(nick),
    declared: (account: string, country: string, older: boolean): void => {
      const key = account.toLowerCase();
      if (older && countries.has(key)) return;
      countries.delete(key);
      const [oldest] = countries.size >= DECLARED_MOST ? countries.keys() : [];
      if (oldest !== undefined) countries.delete(oldest);
      countries.set(key, country);
    },
  };
}
