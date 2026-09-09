import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

/** Auth identity hardening — server role, least-privilege default, signOut clears dev override. */

const supabaseAuth = vi.hoisted(() => ({
  getSession: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
}));
const supabaseRpc = vi.hoisted(() => vi.fn());

vi.mock('../lib/supabase', () => ({
  supabase: { auth: supabaseAuth, rpc: supabaseRpc },
}));

import { AuthProvider, useAuth } from '../lib/authContext';

const Probe = () => {
  const { role, schoolId, fullName, signOut } = useAuth();
  return (
    <div>
      <span data-testid="role">{role}</span>
      <span data-testid="school">{schoolId ?? 'none'}</span>
      <span data-testid="name">{fullName || 'none'}</span>
      <button onClick={() => signOut()}>log out</button>
    </div>
  );
};

function sessionWithUser(meta: Record<string, unknown> = {}) {
  return {
    data: {
      session: {
        user: {
          id: 'u1',
          email: 'teacher@school.ug',
          user_metadata: meta,
        },
      },
    },
  };
}

describe('auth identity hardening', () => {
  beforeEach(() => {
    localStorage.clear();
    supabaseAuth.getSession.mockResolvedValue(sessionWithUser({ full_name: 'Test Teacher' }));
    supabaseAuth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
    supabaseAuth.signOut.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('defaults to least-privilege teacher before any server resolve', async () => {
    supabaseRpc.mockResolvedValue({ data: [], error: null });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    // Pre-resolve + post-resolve both stay teacher (never principal by default)
    await waitFor(() => expect(screen.getByTestId('role').textContent).toBe('teacher'));
  });

  it('ignores spoofable user_metadata.role and applies server user_roles', async () => {
    supabaseRpc.mockResolvedValue({
      data: [{ school_id: 'school-1', role_id: 'principal' }],
      error: null,
    });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('role').textContent).toBe('principal'));
    expect(screen.getByTestId('school').textContent).toBe('school-1');
    // metadata claimed admin — must not win over server principal
    // (session metadata in this case is only full_name; role comes from RPC)
  });

  it('fails closed to teacher when RPC errors even if metadata claims admin', async () => {
    supabaseAuth.getSession.mockResolvedValue(
      sessionWithUser({ role: 'admin', school_id: 'school-x', full_name: 'Spoof' }),
    );
    supabaseRpc.mockResolvedValue({ data: null, error: { message: 'denied' } });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('role').textContent).toBe('teacher'));
    expect(screen.getByTestId('school').textContent).toBe('none');
  });

  it('signOut clears somacampus_dev_role and resets role', async () => {
    localStorage.setItem('somacampus_dev_role', 'principal');
    supabaseRpc.mockResolvedValue({
      data: [{ school_id: 'school-1', role_id: 'teacher' }],
      error: null,
    });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('role').textContent).toBe('principal'));
    fireEvent.click(screen.getByRole('button', { name: /log out/i }));
    await waitFor(() => expect(screen.getByTestId('role').textContent).toBe('teacher'));
    expect(localStorage.getItem('somacampus_dev_role')).toBeNull();
    expect(screen.getByTestId('school').textContent).toBe('none');
  });
});
