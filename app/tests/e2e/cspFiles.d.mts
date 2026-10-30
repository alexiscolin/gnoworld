export function policyLine(line: string): string | undefined;
export function isDetach(line: string): boolean;
export function headerBlocks(text: string): [string, string[]][];
export function headerRules(text: string): Map<string, string>;
export function nginxTable(text: string): Map<string, string>;
