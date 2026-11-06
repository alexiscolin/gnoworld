import { jsonOf } from "@gnoworld/core";

// An event's data, read: JSON of the schema's shape, or none.
export function read<T>(
  data: unknown,
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } },
): T | undefined {
  if (typeof data !== "string") return undefined;
  const parsed = schema.safeParse(jsonOf(data));
  return parsed.success ? parsed.data : undefined;
}
