/**
 * School-scoped guardian identity — Phase 8A parent portal.
 *
 * Resolves the student rows for the signed-in guardian WITHIN one school:
 *   auth user -> people.auth_user_id -> student_guardians(guardian_person_id)
 *   -> student_enrolments(student_id + school_id + active)
 *
 * The school filter is mandatory. A guardian with children enrolled at two
 * schools must resolve per-school; returning cross-school ids can satisfy the
 * wrong school's RLS check. DB enforcement lives in
 * public.current_guardian_student_ids_for_school(UUID); this helper is the
 * client-side counterpart for callers that must pass explicit student_ids
 * (parent portal views). Mirrors resolveMyEmployeeId in ./identity.ts:
 * fail-closed [] when there is no link, throw on DB/network error.
 */
import { supabase } from '../../lib/supabase';

export async function resolveMyChildIds(schoolId: string): Promise<string[]> {
  if (!schoolId) throw new Error('resolveMyChildIds requires a schoolId.');

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) return [];

  const { data: person, error: personError } = await supabase
    .from('people')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (personError) throw personError;
  if (!person) return [];

  const { data: links, error: linkError } = await supabase
    .from('student_guardians')
    .select('student_id')
    .eq('guardian_person_id', (person as any).id);
  if (linkError) throw linkError;
  if (!links || links.length === 0) return [];
  const linkedIds = [...new Set((links as any[]).map((l) => l.student_id).filter(Boolean))];
  if (linkedIds.length === 0) return [];

  // School-qualified + active only: withdrawn/transferred enrolments excluded.
  const { data: enrolments, error: enrError } = await supabase
    .from('student_enrolments')
    .select('student_id')
    .eq('school_id', schoolId)
    .eq('status', 'active')
    .in('student_id', linkedIds);
  if (enrError) throw enrError;
  if (!enrolments) return [];
  return [...new Set((enrolments as any[]).map((e) => e.student_id).filter(Boolean))];
}
