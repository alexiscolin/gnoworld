// The modes of a room's notices, apart from notice.ts: the store holds them, and a module is kept whole by the bundler, so
// what classifies a line (and reads its Markdown) is not the first screen's (ADR-0001 §12; docs/decisions.md, 2026-10-28).

/** What a room tells its reader of: every line, the mentions and replies, or nothing, mentions included. */
export const NOTICE_MODES = ["all", "mentions", "none"] as const;
export type NoticeMode = (typeof NOTICE_MODES)[number];
export const DEFAULT_MODE: NoticeMode = "mentions";
