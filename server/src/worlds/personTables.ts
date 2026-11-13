// A person's side of the same calls (their card): which realms and calls are theirs by caller, and their calls a day, the newest 30 days.
// ponytail: calls counted before this table existed have no day here, so a person's chart fills from the first pass after it.
export const PEOPLE_TABLES = `
CREATE TABLE rollup_caller_days (caller TEXT NOT NULL, day TEXT NOT NULL, calls INTEGER NOT NULL, PRIMARY KEY (caller, day)) STRICT, WITHOUT ROWID;
CREATE INDEX rollup_callers_by_caller ON rollup_callers (caller);
CREATE INDEX rollup_calls_by_caller ON rollup_calls (caller, id);
`;
