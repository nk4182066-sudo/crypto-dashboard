/**
 * tests/register.mjs — installs the TypeScript resolve hook for the Node
 * test runner. Used as: node --import ./tests/register.mjs --test tests/*.test.ts
 */
import { register } from "node:module";

register("./ts-hooks.mjs", import.meta.url);
