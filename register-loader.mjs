// register-loader.mjs — registers loader.mjs (cwd-based "@/" alias resolver) as
// an ESM resolve hook so `node --experimental-strip-types` can import the source
// tree (which uses "@/src/..." path aliases) directly.
import { register } from "node:module";
register(new URL("./loader.mjs", import.meta.url));
