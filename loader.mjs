// resolve-hook: map "@/..." path aliases to absolute file URLs so plain
// `node --experimental-strip-types` can import the source tree.
import { pathToFileURL } from "node:url";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function tryResolve(spec) {
  const base = path.join(ROOT, spec);
  const candidates = [
    base,
    base + ".ts",
    base + ".tsx",
    base + ".mts",
    path.join(base, "index.ts"),
  ];
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) {
      return pathToFileURL(c).href;
    }
  }
  return null;
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const url = tryResolve(specifier.slice(2));
    if (url) return { url, shortCircuit: true };
  }
  return next(specifier, context);
}

