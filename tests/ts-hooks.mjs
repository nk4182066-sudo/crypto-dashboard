/**
 * tests/ts-hooks.mjs — a tiny resolve hook so the Node test runner can load
 * the app's TypeScript modules directly (no bundler, no extra dependency).
 *
 * It resolves:
 *   - "@/foo/bar"  -> <repoRoot>/foo/bar(.ts|.tsx|/index.ts)
 *   - "./foo"      -> <dir of the importer>/foo(.ts|.tsx|/index.ts)
 *
 * Node 22.6+ strips the types natively, so the hook only has to find files.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

/** First existing candidate for a base path, or null. */
function tryFiles(base) {
  const candidates = [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  let target = null;

  if (specifier.startsWith("@/")) {
    target = tryFiles(path.join(root, specifier.slice(2)));
  } else if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const parent = context.parentURL
      ? path.dirname(fileURLToPath(context.parentURL))
      : path.join(root, "tests");
    target = tryFiles(path.resolve(parent, specifier));
  }

  if (target) {
    return {
      url: pathToFileURL(target).href,
      format: "module-typescript",
      shortCircuit: true,
    };
  }

  return nextResolve(specifier, context);
}
