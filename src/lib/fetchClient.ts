/**
 * Client-side `fetch` with a hard deadline. A provider that accepts the
 * connection but never answers would otherwise leave a spinner running
 * forever, so every browser-side network read goes through here and rejects
 * with a normal `Error` once the deadline passes.
 */
const DEFAULT_TIMEOUT_MS = 10_000;

export async function fetchWithTimeout(input: string, init?: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  // Honour a caller-supplied signal alongside our own deadline.
  const externalSignal = init?.signal;
  const abortFromExternal = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", abortFromExternal, { once: true });
  }

  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted && !externalSignal?.aborted) {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${input.split("?")[0]}`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", abortFromExternal);
  }
}