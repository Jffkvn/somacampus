// Deno / Supabase Edge Function: ai-teaching-assistant
// Production Trust Gate: Zero provider API keys in browser; server-side boundary only.
// Inviolable Rule: ABSOLUTELY ZERO AI GRADING. Qualitative observations only.
//
// Phase A2: Authenticate caller (Authorization Bearer -> auth.getUser via anon
// client carrying the user JWT) and verify tenant grounding server-side.
// Service-role client is used ONLY for ownership lookups, never for getUser.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  authorizeAndValidate,
  extractBearerToken,
  type GroundingStore,
  HttpError,
} from "./guard.ts";
import {
  resolveProviderConfig,
  geminiTransportError,
  invalidAiOutputError,
  type ProviderConfig,
} from "./provider.ts";
import {
  AssignmentDraftEdgeSchema,
  ObservationDraftEdgeSchema,
  InterventionDraftEdgeSchema,
} from "./aiSchemas.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestPayload {
  action: "generate_assignment" | "extract_work_observation" | "suggest_intervention";
  payload: Record<string, any>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Call Gemini generateContent and return the parsed JSON payload.
 * Transport failures -> 500 AI_PROVIDER_ERROR; malformed JSON -> 500 AI_INVALID_OUTPUT.
 */
async function callGeminiJson(cfg: ProviderConfig, prompt: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${cfg.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
        }),
      }
    );
  } catch (e) {
    throw geminiTransportError(e instanceof Error ? e.message : "network failure");
  }

  if (!response.ok) {
    throw geminiTransportError(`HTTP ${response.status} ${response.statusText}`);
  }

  let resJson: any;
  try {
    resJson = await response.json();
  } catch {
    throw invalidAiOutputError("provider response was not valid JSON");
  }
  const rawText = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof rawText !== "string" || !rawText.trim()) {
    throw invalidAiOutputError("provider returned no content text");
  }
  try {
    return JSON.parse(rawText);
  } catch {
    throw invalidAiOutputError("provider content was not valid JSON");
  }
}

function supabaseUrl(): string {
  return Deno.env.get("SUPABASE_URL") ?? "";
}

function anonKey(): string {
  return Deno.env.get("SUPABASE_ANON_KEY") ?? "";
}

function serviceRoleKey(): string {
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

function buildStore(): GroundingStore {
  const admin = createClient(supabaseUrl(), serviceRoleKey());
  return {
    async getUserRoles(userId: string) {
      const { data, error } = await admin
        .from("user_roles")
        .select("school_id, role_id")
        .eq("user_id", userId);
      if (error) throw new HttpError(403, "TENANT_FORBIDDEN", "Unable to resolve caller roles.");
      return (data ?? []) as { school_id: string; role_id: string }[];
    },
    async getClassSchool(classId: string) {
      const { data } = await admin.from("classes").select("school_id").eq("id", classId).maybeSingle();
      return (data?.school_id as string | undefined) ?? null;
    },
    async getStreamSchool(streamId: string) {
      const { data: stream } = await admin
        .from("streams")
        .select("class_id")
        .eq("id", streamId)
        .maybeSingle();
      if (!stream?.class_id) return null;
      const { data: cls } = await admin
        .from("classes")
        .select("school_id")
        .eq("id", stream.class_id)
        .maybeSingle();
      return (cls?.school_id as string | undefined) ?? null;
    },
    async getSubjectSchool(subjectId: string) {
      const { data } = await admin.from("subjects").select("school_id").eq("id", subjectId).maybeSingle();
      return (data?.school_id as string | undefined) ?? null;
    },
    async getEmployeeSchool(employeeId: string) {
      const { data } = await admin
        .from("employees")
        .select("school_id")
        .eq("id", employeeId)
        .maybeSingle();
      return (data?.school_id as string | undefined) ?? null;
    },
    async isStudentInSchool(studentId: string, schoolId: string) {
      const { data } = await admin
        .from("student_enrolments")
        .select("id")
        .eq("student_id", studentId)
        .eq("school_id", schoolId)
        .limit(1);
      return Array.isArray(data) && data.length > 0;
    },
    async getResourceSchool(resourceId: string) {
      const { data } = await admin
        .from("school_resources")
        .select("school_id")
        .eq("id", resourceId)
        .maybeSingle();
      return (data?.school_id as string | undefined) ?? null;
    },
    async objectiveExists(code: string) {
      const { data } = await admin
        .from("learning_objectives")
        .select("id")
        .eq("code", code)
        .limit(1);
      return Array.isArray(data) && data.length > 0;
    },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // --- Phase A2 gate: authenticate caller ---
    const token = extractBearerToken(req.headers.get("Authorization"));
    if (!token) {
      return json({ error: "UNAUTHORIZED", message: "Missing Authorization Bearer token." }, 401);
    }

    // Validate the user JWT via the anon client carrying the caller's token.
    // Service-role is NEVER used for getUser — only for ownership lookups below.
    const userClient = createClient(supabaseUrl(), anonKey(), {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return json({ error: "UNAUTHORIZED", message: "Invalid or expired token." }, 401);
    }

    const { action, payload }: RequestPayload = await req.json();

    // --- Phase A2 gate: tenant grounding + objective authority ---
    try {
      await authorizeAndValidate(buildStore(), user.id, action, payload ?? {});
    } catch (e) {
      if (e instanceof HttpError) {
        return json({ error: e.code, message: e.message }, e.status);
      }
      throw e;
    }

    // --- Phase B gate: explicit provider seam (no silent fallbacks) ---
    // AI_PROVIDER selects the backend (default 'gemini'; interface extensible,
    // only gemini implemented). Missing key -> 503; missing model -> 500.
    // There is NO canned deterministic synthesis in production Edge.
    let provider: ProviderConfig;
    try {
      provider = resolveProviderConfig({
        AI_PROVIDER: Deno.env.get("AI_PROVIDER"),
        GEMINI_API_KEY: Deno.env.get("GEMINI_API_KEY"),
        GEMINI_MODEL: Deno.env.get("GEMINI_MODEL"),
      });
    } catch (e) {
      if (e instanceof HttpError) {
        return json({ error: e.code, message: e.message }, e.status);
      }
      throw e;
    }

    if (action === "generate_assignment" || action === "generate_assignment_draft") {
      const prompt = `
You are an expert Cambridge Primary teacher assistant.
Generate a structured, age-appropriate assignment grounded in the Cambridge Primary curriculum standard:
Standard Code: ${payload.objectiveCode}
Standard Description: ${payload.objectiveDescription}
Class Context: ${payload.className} (${payload.subjectName})
Topic: ${payload.topic || "Standard Practice"}
${payload.resourceContent ? `Reference Approved School Resource Material: ${payload.resourceContent}` : ""}
${payload.strugglingConcept ? `Student Evidence Note to Scaffold: ${payload.strugglingConcept}` : ""}

Requirements:
1. Provide a clear, child-friendly title.
2. Provide step-by-step instructions with hints/tape diagram guidance for struggling learners.
3. Provide 4 clear rubric criteria (criteria, maxPoints, guidance).
4. Output strictly valid JSON matching this schema:
{
  "title": "string",
  "instructions": "string",
  "rubric": [
    { "criteria": "string", "maxPoints": number, "guidance": "string" }
  ],
  "maxScore": number
}
`;

      let validated;
      try {
        const parsed = await callGeminiJson(provider, prompt);
        const checked = AssignmentDraftEdgeSchema.safeParse(parsed);
        if (!checked.success) {
          throw invalidAiOutputError(checked.error.issues.map((i) => i.message).join("; "));
        }
        validated = checked.data;
      } catch (e) {
        if (e instanceof HttpError) {
          return json({ error: e.code, message: e.message }, e.status);
        }
        throw e;
      }

      const result = {
        provider: provider.provider,
        title: validated.title,
        instructions: validated.instructions,
        rubric: validated.rubric,
        maxScore: validated.maxScore,
        isAiDrafted: true,
        requiresHumanApproval: true,
        status: "draft",
        approvalState: "unreviewed",
      };

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "extract_work_observation") {
      // INVIOLABLE RULE: ABSOLUTELY ZERO AI GRADING.
      // Must extract qualitative observations of misconceptions or progress only.
      // CAPABILITY HONESTY: text-only extraction. The prompt carries ONLY the
      // teacher-entered workSummary string; no image, photo, or vision input is
      // ever sent to the provider (photoLocation is declared but never populated).
      const prompt = `
You are an expert Cambridge Primary educator reviewing a student's completed learning work.
Assignment: ${payload.assignmentTitle}
Curriculum Standard: ${payload.objectiveCode} - ${payload.objectiveDescription}
Work Type: ${payload.workType}
Summary of Student's Work / Evidence (teacher-entered text only; no images are analysed): ${payload.workSummary}

CRITICAL INSTRUCTION:
- You must NEVER assign a score, numeric mark, percentage, or grade.
- You must NEVER diagnose a learning disability or disorder.
- You must extract observable strengths and conceptual friction (misconceptions).

Output strictly valid JSON matching this schema:
{
  "observationType": "learning_progress" | "misconception",
  "observationText": "string (concise 1-2 sentence qualitative summary)",
  "suggestedFollowupFocus": "string (pedagogical hint for teacher)"
}
`;

      let validated;
      try {
        const parsed = await callGeminiJson(provider, prompt);
        const checked = ObservationDraftEdgeSchema.safeParse(parsed);
        if (!checked.success) {
          throw invalidAiOutputError(checked.error.issues.map((i) => i.message).join("; "));
        }
        validated = checked.data;
      } catch (e) {
        if (e instanceof HttpError) {
          return json({ error: e.code, message: e.message }, e.status);
        }
        throw e;
      }

      const result = {
        provider: provider.provider,
        observationType: validated.observationType,
        observationText: validated.observationText,
        suggestedFollowupFocus: validated.suggestedFollowupFocus,
        isAiDrafted: true,
        requiresHumanApproval: true,
        isGradingForbidden: true,
      };

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "suggest_intervention") {
      const prompt = `
You are an educational specialist assisting a primary teacher.
Student ID (Internal Identifier): ${payload.studentId}
Curriculum Objective: ${payload.curriculumObjective}
Recent Approved Observations:
${payload.approvedObservationSnippets?.join("\n") || "Student observed struggling with target concept."}

Suggest a 15-minute targeted retrieval / scaffolding activity for the teacher to conduct.
Output strictly valid JSON:
{
  "learningArea": "string",
  "topicName": "string",
  "reason": "string (cites the observed evidence)",
  "strategyAction": "string (concrete 15-minute teacher-led retrieval action)",
  "targetOutcome": "string (observable student skill outcome)",
  "suggestedDurationDays": number
}
`;

      let validated;
      try {
        const parsed = await callGeminiJson(provider, prompt);
        const checked = InterventionDraftEdgeSchema.safeParse(parsed);
        if (!checked.success) {
          throw invalidAiOutputError(checked.error.issues.map((i) => i.message).join("; "));
        }
        validated = checked.data;
      } catch (e) {
        if (e instanceof HttpError) {
          return json({ error: e.code, message: e.message }, e.status);
        }
        throw e;
      }

      const result = {
        provider: provider.provider,
        studentId: payload.studentId,
        learningArea: validated.learningArea,
        topicName: validated.topicName,
        reason: validated.reason,
        strategyAction: validated.strategyAction,
        targetOutcome: validated.targetOutcome,
        suggestedDurationDays: validated.suggestedDurationDays,
        status: "draft",
        isAiSuggested: true,
      };

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    if (err instanceof HttpError) {
      return json({ error: err.code, message: err.message }, err.status);
    }
    return new Response(
      JSON.stringify({
        error: "INTERNAL_ERROR",
        message: err.message || "An error occurred in AI assistant",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
