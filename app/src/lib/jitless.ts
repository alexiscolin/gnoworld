// Zod Mini without its compiler, before any schema is made (zod 4.6.7, v4/core/util.js:218, schemas.js:1194): it would
// try `new Function` as each object schema is built, which the page's CSP refuses and reports as a violation.
// The page's root imports this first; and the page's modules take z from here, so each runs after it, whatever
// chunk the bundler puts it in (packages/schemas does the same for its own, in its zod.ts).
import * as z from "zod/mini";

z.config({ jitless: true });

export { z };
