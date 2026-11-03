// A realm's path and a world's id (7c), which the worlds' file and the ticker's trends (7t) both check. Apart from the barrel's modules, so the
// store's chunk, on every page, holds neither: only a page that reads one of the two takes them.
import { WORLDS_CAPS } from "./worldsHead.ts";
import { z } from "./zod.ts";

/** A realm of gno.land by its path: gno's grammar for a segment (`[a-z][a-z0-9]*` joined by `_` or `-`, mempackage.go at v1.5.0), `_test` left out, at most 256 characters, its namespace at most 128 (a Slug). */
export const RealmPath = z.string().check(
  z.maxLength(WORLDS_CAPS.path),
  z.regex(/^gno\.land\/r\/[a-z0-9][a-z0-9]*(?:[_-][a-z0-9]+)*(?:\/[a-z][a-z0-9]*(?:[_-][a-z0-9]+)*)*$/),
  z.refine((path) => !path.endsWith("_test"), { message: "no test path" }),
  // The namespace is a world's namespace, a Slug: at most `name` characters.
  z.refine((path) => (path.split("/")[2] ?? "").length <= WORLDS_CAPS.name, { message: "a namespace of at most 128" }),
);

/** A world by its id: a namespace, and for most worlds the folders that name it. */
export const WorldId = z
  .string()
  .check(z.maxLength(WORLDS_CAPS.path), z.regex(/^[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*)*$/));
