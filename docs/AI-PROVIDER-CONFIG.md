# AI Provider Configuration — Teaching Loop (`ai-teaching-assistant`)

Server-side only. The Vite client never holds provider secrets; all AI calls
route through the deployed Supabase Edge Function `ai-teaching-assistant`,
which validates every model output with zod before returning it.

## Variables (Edge secrets — never `VITE_` prefixed)

| Variable         | Required | Default  | Behaviour when missing |
|-----------------|----------|----------|------------------------|
| `AI_PROVIDER`   | No       | `gemini` | Interface is extensible; only `gemini` is implemented. Any other value → HTTP 500 `AI_PROVIDER_UNSUPPORTED`. |
| `GEMINI_API_KEY`| Yes      | —        | HTTP 503 `AI_PROVIDER_UNCONFIGURED`. No canned fallback is served. |
| `GEMINI_MODEL`  | Yes      | —        | HTTP 500 `AI_PROVIDER_MISCONFIGURED` naming `GEMINI_MODEL`. There is intentionally no default model. |

No model name is hardcoded anywhere in code, docs, or examples: the model is
always taken from `GEMINI_MODEL`.

## Test vs production behaviour

| Environment | Provider failure | Output validation | Deterministic synthesis |
|-------------|------------------|-------------------|-------------------------|
| Production (`MODE !== 'test'`) | Client throws `AiServiceError` (provider + action context); UI surfaces an error banner. Edge maps key-missing → 503, transport failure → 500 `AI_PROVIDER_ERROR`, bad model JSON → 500 `AI_INVALID_OUTPUT`. | Edge validates Gemini JSON with `npm:zod` before returning; client re-validates the Edge response with `teachingAiSchema.ts`. | Never. There is no canned Edge fallback and no client synthetic. |
| Test (`MODE === 'test'`) | Falls back to the deterministic synthesis seam so the mock suite runs offline. | Same schemas validate fixtures. | Allowed only here; every synthetic DTO carries `provider: 'synthetic-test'`. |

## Configure (Supabase CLI)

```bash
supabase secrets set GEMINI_MODEL=<model> GEMINI_API_KEY=<key>
# AI_PROVIDER is optional (defaults to gemini):
supabase secrets set AI_PROVIDER=gemini
```

Redeploy is required after changing secrets:

```bash
supabase functions deploy ai-teaching-assistant
```

## Capability honesty

Evidence extraction is text-only: the Edge prompt carries only the
teacher-entered `workSummary` string. `photoLocation` is declared for API
compatibility but never populated or transmitted, and no image/photo/vision
analysis exists on this path. UI copy states results are "based on
teacher-entered work summary".
