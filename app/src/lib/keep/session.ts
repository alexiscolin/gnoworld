// The tab's own sessionStorage, reached at each use, since reaching it may itself throw (storage blocked).

/** The tab's session storage, or none where it is blocked. */
export function sessionStore(): Storage | undefined {
  try {
    return sessionStorage;
  } catch {
    return undefined;
  }
}
