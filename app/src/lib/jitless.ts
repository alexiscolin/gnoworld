// Zod without its compiler, before any schema is made (zod 4.6.7, v4/core/util.js:218, schemas.js:1194): it would
// try `new Function` as each object schema is built, which the page's CSP refuses and reports as a violation.
// The page's root imports this first, so it runs before any module that makes a schema.
import { z } from "zod";

z.config({ jitless: true });
