/**
 * School-scoped employee identity — D7 hardening.
 *
 * Resolves the employee row for the signed-in user WITHIN one school:
 *   auth user -> people.auth_user_id -> employees(person_id + school_id)
 *
 * The school filter is mandatory. A person employed at two schools has two
 * employee rows; resolving without school context (LIMIT 1 across schools)
 * is ambiguous and can satisfy the wrong school's RLS check. DB enforcement
 * lives in public.current_employee_id_for_school(UUID); this helper is the
 * client-side counterpart for callers that must pass an explicit employee_id
 * (payroll self-service, leave, advances).
 */
import { supabase } from '../../lib/supabase';

export async function resolveMyEmployeeId(schoolId: string): Promise<string | null> {
  if (!schoolId) throw new Error('resolveMyEmployeeId requires a schoolId.');

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) return null;

  const { data: person, error: personError } = await supabase
    .from('people')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (personError) throw personError;
  if (!person) return null;

  // School-qualified: at most one row per (school, person) employment.
  const { data: employment, error: empError } = await supabase
    .from('employees')
    .select('id')
    .eq('person_id', (person as any).id)
    .eq('school_id', schoolId)
    .limit(1)
    .maybeSingle();
  if (empError) throw empError;
  return (employment as any)?.id ?? null;
}
