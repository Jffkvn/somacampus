import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { UserRole, getRoleLandingRoute } from '../config/permissions';

interface AuthUserContextType {
  user: User | null;
  session: Session | null;
  role: UserRole;
  fullName: string;
  schoolId: string | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null; landingRoute?: string }>;
  signOut: () => Promise<void>;
  switchDevRole: (newRole: UserRole) => void;
}

const AuthContext = createContext<AuthUserContextType | undefined>(undefined);

/** Least-privilege pre-session role. Never principal/admin until the server says so. */
const FALLBACK_ROLE: UserRole = 'teacher';

const DEV_ROLE_KEY = 'somacampus_dev_role';

function readDevRoleOverride(): UserRole | null {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null;
  const saved = localStorage.getItem(DEV_ROLE_KEY);
  return saved ? (saved as UserRole) : null;
}

function clearDevRoleOverride(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(DEV_ROLE_KEY);
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole>(() => readDevRoleOverride() ?? FALLBACK_ROLE);
  const [fullName, setFullName] = useState<string>('');
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        void applyServerIdentity(session.user);
      }
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        void applyServerIdentity(session.user);
      }
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  /**
   * Institutional role comes from user_roles via SECURITY DEFINER RPC.
   * user_metadata.role is display-only and MUST NOT elevate UI gates.
   * On RPC failure or empty rows: fail closed to teacher, schoolId null.
   */
  const applyServerIdentity = async (u: User): Promise<UserRole> => {
    const meta = u.user_metadata || {};
    if (meta.full_name) {
      setFullName(String(meta.full_name));
    } else if (u.email) {
      setFullName(u.email.split('@')[0]);
    } else {
      setFullName('');
    }

    const { data, error } = await supabase.rpc('resolve_my_app_roles');
    if (error || !Array.isArray(data) || data.length === 0) {
      if (!readDevRoleOverride()) {
        setRole(FALLBACK_ROLE);
        setSchoolId(null);
      }
      return FALLBACK_ROLE;
    }

    const primary = data[0] as { school_id?: string; role_id?: string };
    const serverRole = (primary.role_id as UserRole) || FALLBACK_ROLE;
    const serverSchool = primary.school_id ?? null;

    const override = readDevRoleOverride();
    setRole(override ?? serverRole);
    setSchoolId(serverSchool);
    return override ?? serverRole;
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        return { error };
      }
      if (data.user) {
        const resolved = await applyServerIdentity(data.user);
        return { error: null, landingRoute: getRoleLandingRoute(resolved) };
      }
      return { error: null, landingRoute: getRoleLandingRoute(FALLBACK_ROLE) };
    } catch (err: unknown) {
      return { error: err instanceof Error ? err : new Error('Login failed') };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    clearDevRoleOverride();
    setUser(null);
    setSession(null);
    setSchoolId(null);
    setFullName('');
    setRole(FALLBACK_ROLE);
  };

  const switchDevRole = (newRole: UserRole) => {
    if (!import.meta.env.DEV) return;
    setRole(newRole);
    if (typeof window !== 'undefined') {
      localStorage.setItem(DEV_ROLE_KEY, newRole);
    }
    if (newRole === 'teacher') {
      setFullName('Sarah Namukasa');
    } else if (newRole === 'principal') {
      setFullName('Dr. Florence Namugga');
    } else if (newRole === 'bursar') {
      setFullName('Sarah Nabwire');
    } else if (newRole === 'admin') {
      setFullName('Peter Okello');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        role,
        fullName,
        schoolId,
        isLoading,
        signIn,
        signOut,
        switchDevRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
