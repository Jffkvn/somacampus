import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { getRoleLandingRoute } from '../config/permissions';

describe('SomaCampus Live Authentication & Role Landing Verification', () => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
  const hasAnonCreds = Boolean(supabaseUrl && anonKey);

  const accounts = [
    { role: 'teacher', email: 'teacher@somacampus.ug', expectedLanding: '/teacher/today' },
    { role: 'principal', email: 'principal@somacampus.ug', expectedLanding: '/dashboard/school' },
    { role: 'admin', email: 'admin@somacampus.ug', expectedLanding: '/admin/overview' },
    { role: 'bursar', email: 'bursar@somacampus.ug', expectedLanding: '/fees' },
    { role: 'parent', email: 'parent@somacampus.ug', expectedLanding: '/parent/home' },
    { role: 'student', email: 'student@somacampus.ug', expectedLanding: '/student/home' },
  ] as const;

  for (const acc of accounts) {
    it.skipIf(!hasAnonCreds)(`authenticates ${acc.role.toUpperCase()} (${acc.email}) and resolves landing route`, async () => {
      const client = createClient(supabaseUrl, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { data, error } = await client.auth.signInWithPassword({
        email: acc.email,
        password: 'SomaCampus2026!',
      });

      expect(error).toBeNull();
      expect(data.user).toBeDefined();
      expect(data.session?.access_token).toBeDefined();

      const userRole = data.user!.user_metadata?.role;
      expect(userRole).toBe(acc.role);

      const landing = getRoleLandingRoute(userRole);
      expect(landing).toBe(acc.expectedLanding);
    });
  }

  it.skipIf(!hasAnonCreds)('rejects invalid password gracefully', async () => {
    const client = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await client.auth.signInWithPassword({
      email: 'teacher@somacampus.ug',
      password: 'WrongPassword123!',
    });

    expect(error).not.toBeNull();
    expect(data.session).toBeNull();
  });
});
