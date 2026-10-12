// Multi-provider AI auto-rotation. Text-only.

export type AIRole = "system" | "user" | "assistant";

export interface AIMessage {
  role: AIRole;
  content: string;
}

export interface AIResult {
  text: string;
  provider: string;
}

type ProviderStyle = "openai" | "cohere" | "gemini";

interface Provider {
  name: string;
  envKey: string;
  model: string;
  endpoint: string;
  style: ProviderStyle;
  skip?: boolean;
}

/** Tried in order; first healthy key wins. Cloudflare needs account_id, so it waits. */
const PROVIDERS: Provider[] = [
  { name: "groq", envKey: "GROQ_KEY_1", model: "llama-3.3-70b-versatile", endpoint: "https://api.groq.com/openai/v1/chat/completions", style: "openai" },
  { name: "mistral", envKey: "MISTRAL_KEY", model: "mistral-small-latest", endpoint: "https://api.mistral.ai/v1/chat/completions", style: "openai" },
  { name: "cohere", envKey: "COHERE_KEY", model: "command-r-plus-08-2024", endpoint: "https://api.cohere.com/v2/chat", style: "cohere" },
  { name: "huggingface", envKey: "HUGGINGFACE_KEY", model: "meta-llama/Llama-3.3-70B-Instruct", endpoint: "https://api-inference.huggingface.co/models/meta-llama/Llama-3.3-70B-Instruct/v1/chat/completions", style: "openai" },
  { name: "openrouter", envKey: "OPENROUTER_KEY_1", model: "qwen/qwen3-coder:free", endpoint: "https://openrouter.ai/api/v1/chat/completions", style: "openai" },
  { name: "gemini", envKey: "GEMINI_KEY_1", model: "gemini-2.0-flash", endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=KEY", style: "gemini" },
  { name: "cloudflare", envKey: "CLOUDFLARE_KEY", model: "@cf/meta/llama-3.3-70b-instruct", endpoint: "https://api.cloudflare.com/client/v4/accounts/ACCOUNT_ID/ai/run/", style: "openai", skip: true },
];

const COOLDOWN_MS = 60_000;
const TIMEOUT_MS = 10_000;

/** envKey name -> epoch ms until which the key stays blocked. */
const blockedUntil = new Map<string, number>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** Returns the env key when present and not cooling down, otherwise null. */
export function getAvailableKey(providerName: string): string | null {
  const provider = PROVIDERS.find((item) => item.name === providerName);
  if (!provider || provider.skip) return null;
  const key = process.env[provider.envKey]?.trim();
  if (!key) return null;
  const blocked = blockedUntil.get(provider.envKey) ?? 0;
  return Date.now() < blocked ? null : key;
}

/** Puts a failed key on a 60 second cooldown. */
export function markKeyFailed(envKeyName: string, error: string): void {
  blockedUntil.set(envKeyName, Date.now() + COOLDOWN_MS);
  console.log(`[AI] ${envKeyName} cooling down 60s: ${error.slice(0, 160)}`);
}

/** Clears the cooldown after a successful call. */
export function markKeySuccess(envKeyName: string): void {
  blockedUntil.delete(envKeyName);
}

/** "gsk_ab...xy" — first 6 chars, ellipsis, last 2. */
export function maskKey(key: string): string {
  return key.length <= 8 ? `${key.slice(0, 2)}...` : `${key.slice(0, 6)}...${key.slice(-2)}`;
}

/** One provider HTTP call with a 15 second abort timeout. */
export async function callProvider(provider: Provider, messages: AIMessage[]): Promise<unknown> {
  const key = getAvailableKey(provider.name);
  if (!key) throw new Error(`${provider.name.toUpperCase()}_KEY_UNAVAILABLE`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    let url = provider.endpoint;
    let body: unknown;

    if (provider.style === "gemini") {
      url = provider.endpoint.replace("KEY", key);
      const prompt = messages.map((message) => `${message.role}: ${message.content}`).join("\n\n");
      body = { contents: [{ parts: [{ text: prompt }] }] };
    } else {
      headers.Authorization = `Bearer ${key}`;
      body = provider.style === "cohere"
        ? { model: provider.model, messages }
        : { model: provider.model, messages, max_tokens: 2000 };
    }

    const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`${provider.name} HTTP ${response.status}: ${detail.slice(0, 160)}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Extracts text from each vendor's response shape. */
export function normalizeResponse(providerName: string, response: unknown): string {
  if (!isRecord(response)) throw new Error(`${providerName} returned a non-object response`);

  if (providerName === "gemini") {
    const first = Array.isArray(response.candidates) ? response.candidates[0] : undefined;
    const parts = isRecord(first) && isRecord(first.content) && Array.isArray(first.content.parts)
      ? first.content.parts
      : [];
    const text = parts.map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : "")).join("");
    if (text) return text;
  } else if (providerName === "cohere") {
    const content = isRecord(response.message) && Array.isArray(response.message.content) ? response.message.content[0] : undefined;
    if (isRecord(content) && typeof content.text === "string" && content.text) return content.text;
  } else {
    const first = Array.isArray(response.choices) ? response.choices[0] : undefined;
    const message = isRecord(first) && isRecord(first.message) ? first.message : undefined;
    if (message && typeof message.content === "string" && message.content) return message.content;
  }

  throw new Error(`${providerName} response had no text`);
}

/** Rejects any image payload — this system is text-only. */
function assertTextOnly(messages: AIMessage[]): void {
  const hasImage = messages.some((message) => /image_url|data:image|"base64"/i.test(message.content));
  if (hasImage) throw new Error("IMAGE_NOT_SUPPORTED");
}

/**
 * MAIN — walks PROVIDERS in order, skips cooling-down keys, and returns the
 * first successful answer. Throws ALL_PROVIDERS_EXHAUSTED when every provider
 * failed. Educational only. Not financial advice.
 */
export async function callAI(messages: AIMessage[]): Promise<AIResult> {
  assertTextOnly(messages);

  for (const provider of PROVIDERS) {
    if (provider.skip) continue;

    const key = getAvailableKey(provider.name);
    if (!key) {
      console.log(`[AI] Skipping ${provider.name} (key missing or cooling down)`);
      continue;
    }

    console.log(`[AI] Trying ${provider.name} (${maskKey(key)})`);
    try {
      const raw = await callProvider(provider, messages);
      const text = normalizeResponse(provider.name, raw).trim();
      if (!text) throw new Error(`${provider.name} returned empty text`);
      markKeySuccess(provider.envKey);
      console.log(`[AI] Response from: ${provider.name}`);
      return { text, provider: provider.name };
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      markKeyFailed(provider.envKey, message);
      console.log(`[AI] ${provider.name} failed: ${message}`);
    }
  }

  throw new Error("ALL_PROVIDERS_EXHAUSTED");
}

