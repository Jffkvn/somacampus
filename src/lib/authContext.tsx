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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole>('teacher');
  const [fullName, setFullName] = useState<string>('Sarah Namukasa');
  const [schoolId, setSchoolId] = useState<string | null>('22222222-2222-2222-2222-222222222222');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 1. Initial session fetch
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        extractUserMetadata(session.user);
      }
      setIsLoading(false);
    });

    // 2. Auth state change listener
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        extractUserMetadata(session.user);
      }
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const extractUserMetadata = (u: User) => {
    const meta = u.user_metadata || {};
    if (meta.role) {
      setRole(meta.role as UserRole);
    }
    if (meta.full_name) {
      setFullName(meta.full_name);
    } else if (u.email) {
      setFullName(u.email.split('@')[0]);
    }
    if (meta.school_id) {
      setSchoolId(meta.school_id);
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        return { error };
      }
      if (data.user) {
        extractUserMetadata(data.user);
        const userRole = (data.user.user_metadata?.role as UserRole) || 'teacher';
        return { error: null, landingRoute: getRoleLandingRoute(userRole) };
      }
      return { error: null, landingRoute: '/teacher/today' };
    } catch (err: unknown) {
      return { error: err instanceof Error ? err : new Error('Login failed') };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole('teacher');
  };

  const switchDevRole = (newRole: UserRole) => {
    if (import.meta.env.DEV) {
      setRole(newRole);
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
