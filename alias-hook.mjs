import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

const rootPath = dirname(dirname(fileURLToPath(import.meta.url)));

function toUrl(relPath) {
  const full = join(rootPath, relPath);
  if (!/\.[cm]?[jt]sx?$/.test(full) && !existsSync(full)) return pathToFileURL(full + ".ts").href;
  return pathToFileURL(full).href;
}

function toUrlRelative(parentURL, specifier) {
  const base = new URL(specifier, parentURL);
  const full = fileURLToPath(base);
  if (!/\.[cm]?[jt]sx?$/.test(full) && !existsSync(full)) return pathToFileURL(full + ".ts").href;
  return base.href;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@/" || specifier.startsWith("@/")) {
    return nextResolve(toUrl(specifier.replace(/^@\//, "")), context);
  }
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    try {
      return await nextResolve(specifier, context);
    } catch {
      return nextResolve(toUrlRelative(context.parentURL, specifier), context);
    }
  }
  return nextResolve(specifier, context);
}


