/**
 * Notification Preferences Page — SomaCampus Phase 8C Task 2.
 *
 * Self-scoped per-category channel toggles backed by
 * notification_preferences (migration 20260913000004). In-app delivery
 * ONLY: email/sms flags are stored intent for a future worker, nothing is
 * sent from this client. Mandatory rows (is_mandatory) keep in-app ON and
 * render locked. No AI, no phone fields.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  NOTIFICATION_CATEGORIES,
  notificationService,
  type NotificationCategory,
  type NotificationPreference,
} from './notificationService';
import { useAuth } from '../../lib/authContext';
import { supabase } from '../../lib/supabase';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { LoadingState } from '../../components/ui/LoadingState';
import { EmptyState } from '../../components/ui/EmptyState';
import { BellRing, Lock } from 'lucide-react';

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  attendance: 'Attendance',
  assignments: 'Assignments',
  observations: 'Observations',
  announcements: 'Announcements',
  fees: 'Fees',
  calendar: 'Calendar',
  messages: 'Messages',
};

const CATEGORY_HINTS: Record<NotificationCategory, string> = {
  attendance: 'Absence and late-arrival alerts for your children or classes.',
  assignments: 'New assignments and upcoming due dates.',
  observations: 'Teacher observations shared with you.',
  announcements: 'School-wide broadcasts and acknowledgement requests.',
  fees: 'Fee assessments, payments, overdue notices and clearance updates.',
  calendar: 'School events and reminders.',
  messages: 'Direct messages sent to you.',
};

function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      className={`flex items-center justify-between gap-3 py-1.5 text-xs ${
        disabled ? 'text-slate-400' : 'text-slate-700'
      }`}
    >
      <span className="font-medium">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault();
          onChange(!checked);
        }}
        className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
          checked ? 'bg-brand-teal' : 'bg-slate-200'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
            checked ? 'left-[18px]' : 'left-0.5'
          }`}
        />
      </button>
    </label>
  );
}

export const NotificationPreferencesPage: React.FC = () => {
  const { schoolId, user } = useAuth();
  const [personId, setPersonId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotificationPreference[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<NotificationCategory | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!schoolId) {
      setError('No school context for this session.');
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      let pid: string | null = null;
      if (user?.id) {
        const { data, error: personError } = await supabase
          .from('people')
          .select('id')
          .eq('auth_user_id', user.id)
          .maybeSingle();
        if (personError) throw personError;
        pid = (data as any)?.id ?? null;
      }
      setPersonId(pid);
      if (!pid) {
        setPrefs([]);
        return;
      }
      setPrefs(await notificationService.getPreferences(pid, schoolId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load preferences.');
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const prefFor = (category: NotificationCategory): NotificationPreference =>
    prefs.find((p) => p.category === category) ?? {
      category,
      inApp: true,
      email: true,
      sms: false,
      isMandatory: false,
    };

  const handleToggle = async (
    category: NotificationCategory,
    key: 'inApp' | 'email' | 'sms',
    next: boolean
  ) => {
    if (!personId || !schoolId || saving) return;
    const current = prefFor(category);
    if (current.isMandatory && key === 'inApp') return;
    setSaving(category);
    setSaveError(null);
    try {
      const saved = await notificationService.setPreference(personId, schoolId, category, {
        [key]: next,
      });
      setPrefs((prev) => {
        const rest = prev.filter((p) => p.category !== category);
        return [...rest, saved];
      });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save preference.');
    } finally {
      setSaving(null);
    }
  };

  if (isLoading) return <LoadingState label="Loading notification preferences…" />;
  if (error) return <EmptyState title="Preferences unavailable" description={error} />;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center gap-2">
        <BellRing className="w-5 h-5 text-brand-teal" />
        <h1 className="text-lg font-bold text-slate-900">Notification preferences</h1>
      </div>
      <p className="text-xs text-slate-500">
        Choose how you hear about each category. In-app notifications marked Required stay on.
      </p>
      {saveError && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          {saveError}
        </p>
      )}
      {NOTIFICATION_CATEGORIES.map((category) => {
        const pref = prefFor(category);
        const isSaving = saving === category;
        return (
          <Card key={category}>
            <CardHeader>
              <CardTitle>
                <span className="flex items-center gap-2">
                  {CATEGORY_LABELS[category]}
                  {pref.isMandatory && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                      <Lock className="w-3 h-3" />
                      Required
                    </span>
                  )}
                  {isSaving && <span className="text-[10px] font-normal text-slate-400">Saving…</span>}
                </span>
              </CardTitle>
              <CardDescription>{CATEGORY_HINTS[category]}</CardDescription>
            </CardHeader>
            <CardContent>
              <Toggle
                label="In-app"
                checked={pref.inApp}
                disabled={pref.isMandatory}
                onChange={(next) => void handleToggle(category, 'inApp', next)}
              />
              <Toggle
                label="Email"
                checked={pref.email}
                onChange={(next) => void handleToggle(category, 'email', next)}
              />
              <Toggle
                label="SMS"
                checked={pref.sms}
                onChange={(next) => void handleToggle(category, 'sms', next)}
              />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
