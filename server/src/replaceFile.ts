import { renameSync, unlinkSync, writeFileSync } from "node:fs";

interface Replacement {
  readonly file: string;
  readonly text: string;
}

/**
 * Writes each text beside its file, then renames each over its file, so a reader sees the old file or the new one, never half of one, and a
 * failed write replaces none of them. False when the folder does not take them: the last files stay whole and no temporary stays behind; only
 * a rename that fails after an earlier one went leaves that earlier file new.
 */
export function replaceFiles(files: readonly Replacement[]): boolean {
  const pending = files.map(({ file, text }) => ({ file, text, temp: `${file}.tmp` }));
  try {
    for (const { temp, text } of pending) writeFileSync(temp, text, { mode: 0o644 });
    for (const { temp, file } of pending) renameSync(temp, file);
    return true;
  } catch {
    for (const { temp } of pending)
      try {
        unlinkSync(temp);
      } catch {
        // Never written, renamed already, or gone.
      }
    return false;
  }
}

/** One file through `replaceFiles`. */
export const replaceFile = (file: string, text: string): boolean => replaceFiles([{ file, text }]);
