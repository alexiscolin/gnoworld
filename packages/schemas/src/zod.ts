// Zod for every schema here, its compiler off before any is built (zod 4.6.7, v4/core/schemas.js:1194, util.js:218):
// it would try `new Function` as each object schema is built, which a page's CSP refuses and reports. A module runs
// after those it imports, whatever chunk a bundler puts it in, so a schema built from this z never tries. The
// server runs with code from strings refused (--disallow-code-generation-from-strings), where the try fails anyway.
import { z } from "zod";

z.config({ jitless: true });

export { z };
