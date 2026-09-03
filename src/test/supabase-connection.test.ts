import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

describe('Remote Supabase Database Verification', () => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  const isMockEnv = !supabaseUrl || /mock|placeholder/i.test(supabaseUrl);
  const hasAdminCreds = Boolean(supabaseUrl && serviceRoleKey);
  const hasAnonCreds = Boolean(supabaseUrl && anonKey) && !isMockEnv;

  const anonClient = hasAnonCreds ? createClient(supabaseUrl, anonKey) : null;
  const adminClient = hasAdminCreds ? createClient(supabaseUrl, serviceRoleKey) : null;

  it.skipIf(!hasAdminCreds)('can query seeded schools with admin client', async () => {
    const { data, error } = await adminClient!.from('schools').select('id, name, code, brand_color');
    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.length).toBeGreaterThan(0);
    expect(data![0].name).toBe("Grace's Cambridge Centre");
    expect(data![0].brand_color).toBe('#006c8b');
  });

  it.skipIf(!hasAdminCreds)('can query seeded classes and subjects with admin client', async () => {
    const { data: classes, error: classErr } = await adminClient!.from('classes').select('name, stage_level');
    expect(classErr).toBeNull();
    expect(classes!.length).toBeGreaterThanOrEqual(2);

    const { data: subjects, error: subjErr } = await adminClient!.from('subjects').select('name, code');
    expect(subjErr).toBeNull();
    expect(subjects!.length).toBeGreaterThanOrEqual(3);
  });

  it.skipIf(!hasAdminCreds)('can query seeded timetable entries for Tuesday schedule with admin client', async () => {
    const { data: entries, error } = await adminClient!.from('timetable_entries').select('*').eq('day_of_week', 2);
    expect(error).toBeNull();
    expect(entries!.length).toBe(3);
  });

  it.skipIf(!hasAnonCreds)('proves that anonymous/unauthenticated client CANNOT bypass RLS to read private data', async () => {
    // Unauthenticated anon client should get 0 rows for teacher reflections
    const { data, error } = await anonClient!.from('teacher_reflections').select('*');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
