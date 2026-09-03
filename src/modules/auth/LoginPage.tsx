import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/authContext';
import { SomaCampusLogo } from '../../components/brand/SomaCampusLogo';
import { Button } from '../../components/ui/Button';
import { Lock, Mail, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';

interface QuickPersona {
  role: string;
  label: string;
  name: string;
  email: string;
  description: string;
}

const QUICK_PERSONAS: QuickPersona[] = [
  {
    role: 'teacher',
    label: 'Teacher',
    name: 'Sarah Namukasa',
    email: 'teacher@somacampus.ug',
    description: 'Classroom, today schedule & fast attendance',
  },
  {
    role: 'principal',
    label: 'Principal',
    name: 'Dr. Edward Ssenyonga',
    email: 'principal@somacampus.ug',
    description: 'School leadership, live teaching & alerts',
  },
  {
    role: 'admin',
    label: 'School Admin',
    name: 'Grace Mukasa',
    email: 'admin@somacampus.ug',
    description: 'Full institutional configuration & HR setup',
  },
  {
    role: 'bursar',
    label: 'Finance / Bursar',
    name: 'Patrick Opolot',
    email: 'bursar@somacampus.ug',
    description: 'Student fee ledgers & statement reconciliation',
  },
  {
    role: 'parent',
    label: 'Parent',
    name: 'Florence Kyomugisha',
    email: 'parent@somacampus.ug',
    description: 'Family fee status & child learning summary',
  },
  {
    role: 'student',
    label: 'Student',
    name: 'Amari Kyomugisha',
    email: 'student@somacampus.ug',
    description: 'Diagnostic quizzes & learning profile',
  },
];

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { signIn } = useAuth();

  const [email, setEmail] = useState('teacher@somacampus.ug');
  const [password, setPassword] = useState('SomaCampus2026!');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg(null);
    setIsLoading(true);

    const res = await signIn(email, password);
    setIsLoading(false);

    if (res.error) {
      setErrorMsg(res.error.message);
    } else if (res.landingRoute) {
      navigate(res.landingRoute);
    }
  };

  const handleQuickLogin = async (persona: QuickPersona) => {
    setEmail(persona.email);
    setPassword('SomaCampus2026!');
    setErrorMsg(null);
    setIsLoading(true);

    const res = await signIn(persona.email, 'SomaCampus2026!');
    setIsLoading(false);

    if (res.error) {
      setErrorMsg(res.error.message);
    } else if (res.landingRoute) {
      navigate(res.landingRoute);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-[#002b36] to-[#001c24] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="flex justify-center mb-4">
          <SomaCampusLogo variant="full" size="lg" theme="dark" />
        </div>
        <p className="text-xs text-teal-200/80 font-medium tracking-wide uppercase">
          Institutional Operating System • Grace's Cambridge Centre
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-xl px-4 sm:px-0">
        <div className="bg-white/95 backdrop-blur-xl py-8 px-6 sm:px-10 shadow-2xl rounded-3xl border border-white/20">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900">Sign in to your account</h2>
            <p className="text-xs text-slate-500 mt-1">
              Authenticate against the live Supabase School OS directory
            </p>
          </div>

          {errorMsg && (
            <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                School Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@somacampus.ug"
                  className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Security Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal font-mono"
                />
              </div>
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full justify-center shadow-md font-bold"
                isLoading={isLoading}
                rightIcon={<ArrowRight className="w-4 h-4" />}
              >
                Sign In to SomaCampus
              </Button>
            </div>
          </form>

          {/* Quick Persona Selector */}
          <div className="mt-8 pt-6 border-t border-slate-100">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="w-4 h-4 text-brand-teal" />
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                1-Click Persona Sign-In (Verified Demo Accounts)
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mb-3">
              Click any verified role below to log in directly with seeded Supabase credentials:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {QUICK_PERSONAS.map((p) => (
                <button
                  key={p.role}
                  type="button"
                  onClick={() => handleQuickLogin(p)}
                  disabled={isLoading}
                  className="text-left p-3 rounded-2xl border border-slate-200/80 hover:border-brand-teal/40 hover:bg-teal-50/50 transition-all text-xs group"
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-bold text-slate-900 group-hover:text-brand-teal transition-colors">
                      {p.label}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-400 group-hover:text-teal-700">
                      {p.email.split('@')[0]}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 font-medium truncate">{p.name}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{p.description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          SomaCampus by JantaHR • Secure Cambridge School Operating System
        </p>
      </div>
    </div>
  );
};
