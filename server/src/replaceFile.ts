import { renameSync, unlinkSync, writeFileSync } from "node:fs";

/**
 * Writes `text` beside `file` and renames it over, so a reader sees the old file or the new one, never half of one. False when
 * the folder does not take it: the last file stays whole and no temporary stays behind.
 */
export function replaceFile(file: string, text: string): boolean {
  const temp = `${file}.tmp`;
  try {
    writeFileSync(temp, text, { mode: 0o644 });
    renameSync(temp, file);
    return true;
  } catch {
    try {
      unlinkSync(temp);
    } catch {
      // Nothing was written, or it is gone already.
    }
    return false;
  }
}
