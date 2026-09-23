// Phase B: Pure AI provider seam for ai-teaching-assistant.
// No Deno or network imports — importable from vitest AND Deno Edge.
// AI_PROVIDER selects the backend: 'gemini' (default) or 'openai'.
// Keys stay server-side (never VITE_*). Pin GEMINI_MODEL / OPENAI_MODEL (no "latest").

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export type AiProviderName = "gemini" | "openai";

export interface ProviderConfig {
  provider: AiProviderName;
  apiKey: string;
  model: string;
}

export interface ProviderEnv {
  AI_PROVIDER?: string | null;
  GEMINI_API_KEY?: string | null;
  GEMINI_MODEL?: string | null;
  OPENAI_API_KEY?: string | null;
  OPENAI_MODEL?: string | null;
}

/**
 * Resolve the configured AI provider. Throws HttpError:
 *  500 AI_PROVIDER_UNSUPPORTED when AI_PROVIDER names an unimplemented backend,
 *  503 AI_PROVIDER_UNCONFIGURED when the provider API key is missing,
 *  500 AI_PROVIDER_MISCONFIGURED when the model is missing (never defaulted).
 */
export function resolveProviderConfig(env: ProviderEnv): ProviderConfig {
  const raw = (env.AI_PROVIDER ?? "").trim().toLowerCase();
  const providerName: AiProviderName = raw === "" ? "gemini" : (raw as AiProviderName);

  if (providerName !== "gemini" && providerName !== "openai") {
    throw new HttpError(
      500,
      "AI_PROVIDER_UNSUPPORTED",
      `Unsupported AI provider "${env.AI_PROVIDER}". Supported: gemini, openai.`,
    );
  }

  if (providerName === "openai") {
    const apiKey = (env.OPENAI_API_KEY ?? "").trim();
    if (!apiKey) {
      throw new HttpError(
        503,
        "AI_PROVIDER_UNCONFIGURED",
        "AI provider is not configured: OPENAI_API_KEY is missing. Set it via Supabase secrets and redeploy.",
      );
    }
    const model = (env.OPENAI_MODEL ?? "").trim();
    if (!model) {
      throw new HttpError(
        500,
        "AI_PROVIDER_MISCONFIGURED",
        "AI provider model is not configured: OPENAI_MODEL is missing. Set it via Supabase secrets and redeploy.",
      );
    }
    return { provider: "openai", apiKey, model };
  }

  const apiKey = (env.GEMINI_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new HttpError(
      503,
      "AI_PROVIDER_UNCONFIGURED",
      "AI provider is not configured: GEMINI_API_KEY is missing. Set it via Supabase secrets and redeploy.",
    );
  }

  const model = (env.GEMINI_MODEL ?? "").trim();
  if (!model) {
    throw new HttpError(
      500,
      "AI_PROVIDER_MISCONFIGURED",
      "AI provider model is not configured: GEMINI_MODEL is missing. Set it via Supabase secrets and redeploy.",
    );
  }

  return { provider: "gemini", apiKey, model };
}

/** Map a provider transport failure to an HTTP 500 provider error. */
export function geminiTransportError(detail: string): HttpError {
  return new HttpError(500, "AI_PROVIDER_ERROR", `AI provider request failed: ${detail}`);
}

/** Map a malformed/unexpected payload to an HTTP 500 output error. */
export function invalidAiOutputError(detail: string): HttpError {
  return new HttpError(500, "AI_INVALID_OUTPUT", `AI provider returned an unexpected payload: ${detail}`);
}
