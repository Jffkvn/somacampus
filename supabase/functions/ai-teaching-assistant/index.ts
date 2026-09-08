// Deno / Supabase Edge Function: ai-teaching-assistant
// Production Trust Gate: Zero provider API keys in browser; server-side boundary only.
// Inviolable Rule: ABSOLUTELY ZERO AI GRADING. Qualitative observations only.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestPayload {
  action: "generate_assignment" | "extract_work_observation" | "suggest_intervention";
  payload: Record<string, any>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    const model = Deno.env.get("GEMINI_MODEL") || "gemini-2.0-flash";
    const { action, payload }: RequestPayload = await req.json();

    if (!apiKey) {
      if (action === "generate_assignment" || action === "generate_assignment_draft") {
        const topic = payload.topic || payload.objectiveTitle || "Fractions & Decimals";
        const struggling = payload.strugglingConcept || payload.evidenceContext?.strugglingConcept;
        let instructions = `### Learning Goal (${payload.objectiveCode})\n${payload.objectiveDescription}\n\n`;
        instructions += `### Instructions\n1. Complete all exercises with step-by-step mathematical reasoning.\n2. Use visual tape diagrams to show equivalent fractions.\n\n`;
        instructions += `### Student Tasks\n`;
        instructions += `#### Part A: Core Concepts & Fluency\n1. Complete questions 1-4 on finding equivalent values using visual models.\n\n`;
        instructions += `#### Part B: Guided Application & Scaffolding\n2. Solve questions 5-8 showing full step-by-step working and conversion logic.\n`;
        instructions += `3. Explain in two sentences how a tape diagram proves equivalence for unequal denominators.\n`;
        if (struggling) {
          instructions += `\n### Scaffolded Support & Hint Box\n`;
          instructions += `> **💡 Scaffolding Hint:** For ${struggling}, draw a 10-segment fraction strip before calculating.\n`;
        }

        return new Response(
          JSON.stringify({
            title: `Stage 5 ${payload.subjectName || "Mathematics"}: ${topic} Practice`,
            instructions,
            rubric: [
              { criterion: `${payload.objectiveCode} Conceptual Accuracy`, points: 20, descriptors: "Demonstrates clear understanding of equivalences." },
              { criterion: "Step-by-Step Mathematical Working", points: 15, descriptors: "Shows clear fraction diagrams." },
              { criterion: "Applied Word Problem Resolution", points: 10, descriptors: "Sets up and calculates real-world questions." },
              { criterion: "Neatness & Unit Notation", points: 5, descriptors: "Clear layout and units." },
            ],
            maxScore: 50,
            isAiDrafted: true,
            requiresHumanApproval: true,
            status: "draft",
            approvalState: "unreviewed",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (action === "extract_work_observation") {
        const isFriction =
          (payload.workSummary || "").toLowerCase().includes("struggl") ||
          (payload.workSummary || "").toLowerCase().includes("confus") ||
          (payload.workSummary || "").toLowerCase().includes("unlike") ||
          (payload.workSummary || "").toLowerCase().includes("error");

        return new Response(
          JSON.stringify({
            observationType: isFriction ? "misconception" : "learning_progress",
            observationText: isFriction
              ? `Learner demonstrates understanding of common denominator fractions, but showed friction converting unlike denominators in: "${payload.workSummary}".`
              : `Learner successfully demonstrated skill for ${payload.objectiveCode} with clear mathematical working in: "${payload.workSummary}".`,
            suggestedFollowupFocus: isFriction ? "10-minute visual fraction strip retrieval" : "Independent extension problems",
            isAiDrafted: true,
            requiresHumanApproval: true,
            isGradingForbidden: true,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (action === "suggest_intervention") {
        return new Response(
          JSON.stringify({
            studentId: payload.studentId,
            learningArea: "Mathematics",
            topicName: "Fractions & Decimals",
            reason: `Approved observations cite friction with ${payload.curriculumObjective}: ${
              payload.approvedObservationSnippets?.[0] || "struggle with unlike denominators"
            }`,
            strategyAction: "Conduct structured 15-minute small-group retrieval practice with concrete fraction strips twice weekly.",
            targetOutcome: "Student independently identifies and converts fractions with unlike denominators with at least 80% accuracy.",
            suggestedDurationDays: 14,
            status: "draft",
            isAiSuggested: true,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
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

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.statusText}`);
      }

      const resJson = await response.json();
      const rawText = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
      const parsed = JSON.parse(rawText);

      const result = {
        title: parsed.title,
        instructions: parsed.instructions,
        rubric: parsed.rubric,
        maxScore: parsed.maxScore || 20,
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
      const prompt = `
You are an expert Cambridge Primary educator reviewing a student's completed learning work.
Assignment: ${payload.assignmentTitle}
Curriculum Standard: ${payload.objectiveCode} - ${payload.objectiveDescription}
Work Type: ${payload.workType}
Summary of Student's Work / Evidence: ${payload.workSummary}

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

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.statusText}`);
      }

      const resJson = await response.json();
      const rawText = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
      const parsed = JSON.parse(rawText);

      const result = {
        observationType: parsed.observationType === "misconception" ? "misconception" : "learning_progress",
        observationText: parsed.observationText,
        suggestedFollowupFocus: parsed.suggestedFollowupFocus,
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

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.statusText}`);
      }

      const resJson = await response.json();
      const rawText = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
      const parsed = JSON.parse(rawText);

      const result = {
        studentId: payload.studentId,
        learningArea: parsed.learningArea || "Mathematics",
        topicName: parsed.topicName || "Fractions & Decimals",
        reason: parsed.reason,
        strategyAction: parsed.strategyAction,
        targetOutcome: parsed.targetOutcome,
        suggestedDurationDays: parsed.suggestedDurationDays || 14,
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
