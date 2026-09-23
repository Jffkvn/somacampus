// Meet/Zoom recording webhook → online_session_recordings.
// Shared secret header x-recording-secret (set in function env).
// No native video; external URL only. Idempotent on (session, provider, provider_recording_id).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-recording-secret",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const secret = Deno.env.get("RECORDING_WEBHOOK_SECRET");
  const provided = req.headers.get("x-recording-secret");
  if (!secret || !provided || provided !== secret) {
    return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const raw = await req.text();
    if (raw.length > 50_000) {
      return new Response(JSON.stringify({ error: "PAYLOAD_TOO_LARGE" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const body = JSON.parse(raw);
    const {
      school_id: schoolId,
      session_id: sessionId,
      provider = "custom",
      provider_recording_id: providerRecordingId = null,
      url,
      started_at: startedAt = null,
      ended_at: endedAt = null,
      duration_seconds: durationSeconds = null,
    } = body ?? {};

    if (!schoolId || !sessionId || !url) {
      return new Response(JSON.stringify({ error: "school_id, session_id, url required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await admin
      .from("online_session_recordings")
      .upsert(
        {
          school_id: schoolId,
          session_id: sessionId,
          provider,
          provider_recording_id: providerRecordingId,
          url,
          started_at: startedAt,
          ended_at: endedAt,
          duration_seconds: durationSeconds,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "session_id,provider,provider_recording_id" },
      )
      .select("id, url, provider")
      .single();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, recording: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "bad request" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
