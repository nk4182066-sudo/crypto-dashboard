/**
 * Google Gemini provider for the AI Trading Assistant.
 *
 * Replaces the previous Groq integration (api.groq.com/openai/v1) with the
 * official Google Gen AI SDK, authenticated with GEMINI_API_KEY from
 * .env.local. The SDK is initialised lazily and memoised per API key so a hot
 * reload does not rebuild the client on every request.
 *
 * gemini-2.5-flash is used for every tier: it is the current ultra-fast
 * reasoning-tuned model, so both short answers and full analyst breakdowns
 * come back with low latency on the free tier.
 */

import { GoogleGenAI, type GenerateContentResponse } from "@google/genai";

export const GEMINI_MODEL = "gemini-2.5-flash";

const DEFAULT_MAX_OUTPUT_TOKENS = 4096;

let cachedClient: { key: string; client: GoogleGenAI } | null = null;

/** Returns a memoised Gen AI client, or null when no key is configured. */
export function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  if (cachedClient?.key === apiKey) return cachedClient.client;

  const client = new GoogleGenAI({ apiKey });
  cachedClient = { key: apiKey, client };
  return client;
}

/**
 * Translates the OpenAI-style `{role, content}` history used across the app
 * into Gemini `contents`. Gemini has no `system` role, so the caller passes the
 * system instruction separately and it is attached as `systemInstruction`.
 */
export interface ChatTurn {
  role: "user" | "assistant";
  /** Plain text, or a Gemini `parts` array when the turn carries an image. */
  content: string | Array<Record<string, unknown>>;
}

export interface GeminiCallOptions {
  model?: string;
  systemInstruction: string;
  contents: Array<{ role: "user" | "model"; parts: Array<Record<string, unknown>> }>;
  temperature?: number;
  maxOutputTokens?: number;
  /** Ask for a JSON object back (used by the chart-analysis path). */
  responseMimeType?: "application/json" | "text/plain";
  signal?: AbortSignal;
}

export class GeminiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GeminiError";
    this.status = status;
  }
}

/** Maps a Gemini SDK failure onto the HTTP status the chat route reports. */
function statusForGeminiError(error: unknown): number {
  const raw = error instanceof Error ? error.message : String(error);
  const match = raw.match(/\b(4\d\d|5\d\d)\b/);
  const parsed = match ? Number(match[1]) : NaN;
  if (Number.isFinite(parsed) && parsed >= 400 && parsed <= 599) return parsed;
  return 503;
}

function describeGeminiError(error: unknown): string {
  if (error instanceof GeminiError) return error.message;
  const raw = error instanceof Error ? error.message : String(error);
  return raw.slice(0, 240) || "The Gemini request could not be completed.";
}

/** True when the failure is an auth/permission problem worth surfacing. */
export function isGeminiAuthError(status: number): boolean {
  return status === 400 || status === 401 || status === 403;
}

/**
 * Calls Gemini and returns the raw text of the first candidate.
 * Throws {@link GeminiError} so the caller can map the status itself.
 */
export async function callGemini(options: GeminiCallOptions): Promise<string> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new GeminiError("Google Gemini API key not configured. Add GEMINI_API_KEY to .env.local and restart the server.", 500);
  }

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: options.model ?? GEMINI_MODEL,
      contents: options.contents,
      config: {
        systemInstruction: options.systemInstruction,
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        ...(options.responseMimeType ? { responseMimeType: options.responseMimeType } : {}),
      },
      ...(options.signal ? { signal: options.signal } : {}),
    });

    const text = response.text;
    if (!text || !text.trim()) {
      throw new GeminiError("Gemini returned an empty response. Please try again.", 502);
    }
    return text;
  } catch (error) {
    if (error instanceof GeminiError) throw error;
    throw new GeminiError(describeGeminiError(error), statusForGeminiError(error));
  }
}