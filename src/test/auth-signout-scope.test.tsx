import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

/** Phase A3 — signOut must reset school scope (stale scope must not linger). */

const supabaseAuth = vi.hoisted(() => ({
  getSession: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChange: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({
  supabase: { auth: supabaseAuth },
}));

import { AuthProvider, useAuth } from '../lib/authContext';

const Probe = () => {
  const { schoolId, signOut } = useAuth();
  return (
    <div>
      <span data-testid="school">{schoolId ?? 'none'}</span>
      <button onClick={() => signOut()}>log out</button>
    </div>
  );
};

describe('authContext signOut scope reset', () => {
  beforeEach(() => {
    supabaseAuth.getSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: 'u1',
            email: 'teacher@school.ug',
            user_metadata: { role: 'teacher', school_id: 'school-1', full_name: 'Test Teacher' },
          },
        },
      },
    });
    supabaseAuth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
    supabaseAuth.signOut.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('resets schoolId to null on signOut', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('school').textContent).toBe('school-1'));
    fireEvent.click(screen.getByRole('button', { name: /log out/i }));
    await waitFor(() => expect(screen.getByTestId('school').textContent).toBe('none'));
    expect(supabaseAuth.signOut).toHaveBeenCalled();
  });
});
