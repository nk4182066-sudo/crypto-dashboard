// Registers a resolve hook that maps the "@/..." path alias (used across the
// codebase) to the local src/ directory so diagnostic scripts can import the
// real engine under plain `node --experimental-strip-types`.
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register(new URL("./alias-hook.mjs", import.meta.url));
void pathToFileURL;
