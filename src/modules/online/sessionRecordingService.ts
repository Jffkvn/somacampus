/**
 * Digital Learning Spine P1 — provider recording → catch-up.
 *
 * Charter §12: external provider URLs are fine (Meet/Zoom/Teams/custom).
 * No native WebRTC. A recording is a LEARNING ARTIFACT: ingested here and
 * optionally published as a learning_activities RESOURCE ("catch-up").
 */
import { supabase } from '../../lib/supabase';

export type RecordingProvider = 'meet' | 'zoom' | 'teams' | 'custom';

export interface SessionRecording {
  id: string;
  schoolId: string;
  sessionId: string;
  provider: RecordingProvider;
  providerRecordingId: string | null;
  url: string;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  catchUpActivityId: string | null;
}

export interface IngestRecordingInput {
  schoolId: string;
  sessionId: string;
  provider: RecordingProvider;
  url: string;
  providerRecordingId?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  durationSeconds?: number | null;
  ingestedByPersonId?: string | null;
}

export interface CatchUpItem {
  recordingId: string;
  sessionId: string;
  title: string;
  provider: RecordingProvider;
  url: string;
  durationSeconds: number | null;
  startedAt: string | null;
  catchUpActivityId: string | null;
  sessionNote: string | null;
  offeringId: string | null;
}

const isMockEnv = (): boolean =>
  process.env.NODE_ENV === 'test' ||
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

const PROVIDERS: ReadonlySet<string> = new Set(['meet', 'zoom', 'teams', 'custom']);

function mapRecording(r: any): SessionRecording {
  return {
    id: r.id,
    schoolId: r.school_id,
    sessionId: r.session_id,
    provider: r.provider,
    providerRecordingId: r.provider_recording_id ?? null,
    url: r.url,
    startedAt: r.started_at ?? null,
    endedAt: r.ended_at ?? null,
    durationSeconds: r.duration_seconds == null ? null : Number(r.duration_seconds),
    catchUpActivityId: r.catch_up_activity_id ?? null,
  };
}

export function validateIngestRecording(input: IngestRecordingInput): void {
  if (!input.schoolId) throw new Error('recording: schoolId is required');
  if (!input.sessionId) throw new Error('recording: sessionId is required');
  if (!PROVIDERS.has(input.provider)) {
    throw new Error('recording: provider must be meet | zoom | teams | custom');
  }
  if (!input.url?.trim() || !/^https?:\/\//i.test(input.url.trim())) {
    throw new Error('recording: url must be an http(s) link to the provider recording');
  }
  if (input.durationSeconds != null && Number(input.durationSeconds) < 0) {
    throw new Error('recording: durationSeconds cannot be negative');
  }
  if (input.startedAt && input.endedAt && input.endedAt < input.startedAt) {
    throw new Error('recording: endedAt cannot be before startedAt');
  }
}

export const sessionRecordingService = {
  /**
   * Ingest a provider recording (webhook payload or staff paste).
   * Idempotent on (session_id, provider, provider_recording_id).
   */
  async ingestRecording(input: IngestRecordingInput): Promise<SessionRecording> {
    validateIngestRecording(input);
    if (isMockEnv()) throw new Error('recording.ingestRecording: unavailable without live database');

    const { data, error } = await supabase
      .from('online_session_recordings')
      .upsert(
        {
          school_id: input.schoolId,
          session_id: input.sessionId,
          provider: input.provider,
          provider_recording_id: input.providerRecordingId ?? null,
          url: input.url.trim(),
          started_at: input.startedAt ?? null,
          ended_at: input.endedAt ?? null,
          duration_seconds: input.durationSeconds ?? null,
          ingested_by: input.ingestedByPersonId ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'session_id,provider,provider_recording_id' },
      )
      .select('*')
      .single();
    if (error || !data) throw new Error(`recording.ingestRecording: ${error?.message ?? 'no row'}`);
    return mapRecording(data);
  },

  /**
   * Publish the recording as a learning_activities RESOURCE (catch-up
   * artifact under the session's offering — not a bare MP4 library).
   */
  async publishCatchUpActivity(input: {
    schoolId: string;
    recordingId: string;
    sessionId: string;
    onlineOfferingId: string;
    title?: string;
    notes?: string | null;
  }): Promise<{ recording: SessionRecording; catchUpActivityId: string }> {
    if (isMockEnv()) throw new Error('recording.publishCatchUpActivity: unavailable without live database');

    const title = (input.title ?? 'Session catch-up').trim();
    const { data: activity, error: actErr } = await supabase
      .from('learning_activities')
      .insert({
        school_id: input.schoolId,
        online_offering_id: input.onlineOfferingId,
        online_session_id: input.sessionId,
        activity_type: 'RESOURCE',
        title,
        instructions: input.notes?.trim() || 'Watch the session recording to catch up.',
        resource_url: null,
        is_published: true,
        sort_order: 1000,
      })
      .select('id')
      .single();
    if (actErr || !activity) {
      throw new Error(`recording.publishCatchUpActivity: ${actErr?.message ?? 'no activity'}`);
    }

    const { data: rec, error: recErr } = await supabase
      .from('online_session_recordings')
      .update({
        catch_up_activity_id: activity.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.recordingId)
      .select('*')
      .single();
    if (recErr || !rec) {
      throw new Error(`recording.publishCatchUpActivity(link): ${recErr?.message ?? 'no row'}`);
    }
    return { recording: mapRecording(rec), catchUpActivityId: String(activity.id) };
  },

  async listForSession(sessionId: string): Promise<SessionRecording[]> {
    if (isMockEnv()) return [];
    const { data, error } = await supabase
      .from('online_session_recordings')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`recording.listForSession: ${error.message}`);
    return (data ?? []).map(mapRecording);
  },

  /**
   * Catch-up feed for one learner: recordings for sessions in their active
   * offerings. Permission is RLS + enrolment scoped (charter §17).
   */
  async listCatchUpForStudent(studentIdOrEmail: string, schoolId: string): Promise<CatchUpItem[]> {
    if (isMockEnv()) return [];
    const isUUID = (v: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

    let studentId = studentIdOrEmail;
    if (!isUUID(studentIdOrEmail)) {
      const { data: peopleRows, error: personError } = await supabase
        .from('people')
        .select('id')
        .eq('email', studentIdOrEmail);
      if (personError) throw new Error(`recording.listCatchUp: ${personError.message}`);
      const personIds = [...new Set(((peopleRows ?? []) as any[]).map((p) => String(p.id)))];
      if (personIds.length === 0) return [];
      const { data: studentRows, error: studentError } = await supabase
        .from('students')
        .select('id')
        .in('person_id', personIds);
      if (studentError) throw new Error(`recording.listCatchUp(students): ${studentError.message}`);
      const students = (studentRows ?? []) as any[];
      if (students.length !== 1) return [];
      studentId = String(students[0].id);
    }

    const { data: enrolments, error: enrolErr } = await supabase
      .from('online_enrolments')
      .select('offering_id')
      .eq('school_id', schoolId)
      .eq('student_id', studentId)
      .eq('status', 'active');
    if (enrolErr) throw new Error(`recording.listCatchUp(enrolments): ${enrolErr.message}`);
    const offeringIds = [...new Set(((enrolments ?? []) as any[]).map((e) => String(e.offering_id)))];
    if (offeringIds.length === 0) return [];

    const { data: sessions, error: sessionError } = await supabase
      .from('online_sessions')
      .select('id, offering_id, session_note, scheduled_start, offering:online_offerings(id, title)')
      .in('offering_id', offeringIds);
    if (sessionError) throw new Error(`recording.listCatchUp(sessions): ${sessionError.message}`);
    const sessionRows = ((sessions ?? []) as any[]) ?? [];
    const sessionById = new Map(sessionRows.map((s) => [String(s.id), s]));
    if (sessionRows.length === 0) return [];

    const { data: recs, error: recErr } = await supabase
      .from('online_session_recordings')
      .select('*')
      .in('session_id', sessionRows.map((s) => String(s.id)))
      .order('created_at', { ascending: false });
    if (recErr) throw new Error(`recording.listCatchUp(recordings): ${recErr.message}`);

    return ((recs ?? []) as any[]).map((r) => {
      const session = sessionById.get(String(r.session_id));
      const offering = Array.isArray(session?.offering) ? session.offering[0] : session?.offering;
      return {
        recordingId: String(r.id),
        sessionId: String(r.session_id),
        title: offering?.title ? String(offering.title) : 'Session recording',
        provider: r.provider,
        url: String(r.url),
        durationSeconds: r.duration_seconds == null ? null : Number(r.duration_seconds),
        startedAt: r.started_at ?? session?.scheduled_start ?? null,
        catchUpActivityId: r.catch_up_activity_id ?? null,
        sessionNote: session?.session_note ? String(session.session_note) : null,
        offeringId: session?.offering_id ? String(session.offering_id) : null,
      };
    });
  },
};
