import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, Bell, User, ChevronDown, Sparkles, CheckCheck, Settings2 } from 'lucide-react';
import { UserRole } from '../../config/permissions';
import { cn } from '../../lib/utils';
import {
  notificationService,
  resolveMyPersonId,
  type NotificationItem,
} from '../../modules/notifications/notificationService';

export interface TopHeaderProps {
  currentRole: UserRole;
  onRoleChange: (role: UserRole) => void;
  onMobileMenuToggle: () => void;
  userName?: string;
  userEmail?: string;
  onSignOut?: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  currentRole,
  onRoleChange,
  onMobileMenuToggle,
  userName = 'Sarah Namukasa',
  userEmail = 'sarah.n@graceschool.ac.ug',
  onSignOut,
}) => {
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showBell, setShowBell] = useState(false);
  const [personId, setPersonId] = useState<string | null>(null);
  const [feed, setFeed] = useState<NotificationItem[]>([]);
  const [isMarkingRead, setIsMarkingRead] = useState(false);

  const loadFeed = useCallback(async (pid: string | null) => {
    if (!pid) return;
    try {
      setFeed(await notificationService.getMyNotifications(pid));
    } catch {
      // Fail-closed: header never breaks on notification errors; mock env
      // returns [] without touching the DB.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pid = await resolveMyPersonId();
        if (cancelled) return;
        setPersonId(pid);
        await loadFeed(pid);
      } catch {
        // No session / no person row / mock env: no badge, no crash.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadFeed]);

  const unreadCount = feed.filter((n) => n.unread).length;

  const handleBellToggle = async () => {
    const next = !showBell;
    setShowBell(next);
    setShowUserMenu(false);
    if (next) await loadFeed(personId);
  };

  const handleMarkAllRead = async () => {
    if (!personId || unreadCount === 0 || isMarkingRead) return;
    setIsMarkingRead(true);
    try {
      await notificationService.markAllRead(personId);
      setFeed((prev) => prev.map((n) => ({ ...n, unread: false, status: 'read' as const })));
    } catch {
      // Keep existing state on failure; RLS denials surface on the page.
    } finally {
      setIsMarkingRead(false);
    }
  };

  const availableRoles: Array<{ id: UserRole; label: string; desc: string }> = [
    { id: 'teacher', label: 'Teacher', desc: 'Classroom, Today & attendance' },
    { id: 'principal', label: 'Principal', desc: 'School leadership & oversight' },
    { id: 'bursar', label: 'Finance / Bursar', desc: 'Fee accounts & payment reconciliation' },
    { id: 'admin', label: 'School Admin', desc: 'Full institutional configuration' },
    { id: 'parent', label: 'Parent', desc: 'Family progress & fee status' },
    { id: 'student', label: 'Student', desc: 'Assignments & diagnostic quizzes' },
  ];

  return (
    <header className="sticky top-0 z-30 h-18 bg-white/80 backdrop-blur-md border-b border-slate-200/80 px-4 lg:px-8 flex items-center justify-between">
      {/* Left: Mobile hamburger & breadcrumb/school pill */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMobileMenuToggle}
          className="lg:hidden p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          aria-label="Toggle navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100/70 border border-slate-200/60 text-xs text-slate-700">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-semibold text-slate-900">Academic Year 2026-2027</span>
          <span className="text-slate-400">•</span>
          <span>Cambridge Primary</span>
        </div>
      </div>

      {/* Right Controls: Dev Role Switcher, Notifications, User Profile */}
      <div className="flex items-center gap-3">
        {/* DEV ONLY Role Switcher: Explicitly isolated from production auth */}
        {import.meta.env.DEV && (
          <div className="relative">
            <button
              onClick={() => setShowRoleMenu(!showRoleMenu)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-50 border border-teal-200/80 text-teal-800 text-xs font-semibold hover:bg-teal-100/80 transition-colors shadow-sm"
              title="Development Persona Preview"
            >
              <Sparkles className="w-3.5 h-3.5 text-brand-teal" />
              <span className="capitalize">Role: {currentRole}</span>
              <ChevronDown className="w-3.5 h-3.5 text-teal-600" />
            </button>

            {showRoleMenu && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200/80 p-2 z-50 animate-in fade-in zoom-in-95">
                <div className="px-3 py-2 border-b border-slate-100 mb-1">
                  <p className="text-[11px] font-bold tracking-wider uppercase text-slate-400">
                    Dev Persona Switcher
                  </p>
                  <p className="text-[10px] text-amber-600 font-medium mt-0.5">
                    Isolated to dev mode; not used in production auth.
                  </p>
                </div>
                <div className="space-y-1">
                  {availableRoles.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => {
                        onRoleChange(r.id);
                        setShowRoleMenu(false);
                      }}
                      className={cn(
                        'w-full text-left px-3 py-2 rounded-xl text-xs transition-colors flex flex-col',
                        currentRole === r.id
                          ? 'bg-brand-teal/10 text-brand-teal font-semibold'
                          : 'text-slate-700 hover:bg-slate-50'
                      )}
                    >
                      <span>{r.label}</span>
                      <span className="text-[10px] text-slate-400 font-normal">{r.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Notification Bell */}
        <div className="relative">
          <button
            onClick={handleBellToggle}
            className="relative p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            aria-label="View notifications"
            aria-expanded={showBell}
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showBell && (
            <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white rounded-2xl shadow-xl border border-slate-200/80 z-50 overflow-hidden animate-in fade-in zoom-in-95">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <p className="text-xs font-bold text-slate-900">
                  Notifications{unreadCount > 0 ? ` (${unreadCount} unread)` : ''}
                </p>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    disabled={isMarkingRead}
                    className="flex items-center gap-1 text-[11px] font-semibold text-brand-teal hover:underline disabled:opacity-50"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>{isMarkingRead ? 'Marking…' : 'Mark all read'}</span>
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {feed.length === 0 ? (
                  <p className="px-4 py-6 text-xs text-slate-500 text-center">
                    You're all caught up — no notifications.
                  </p>
                ) : (
                  feed.slice(0, 8).map((n) => (
                    <div
                      key={n.id}
                      className={cn(
                        'px-4 py-2.5 border-b border-slate-50 last:border-0',
                        n.unread ? 'bg-teal-50/60' : 'bg-white'
                      )}
                    >
                      <p className={cn('text-xs', n.unread ? 'font-semibold text-slate-900' : 'text-slate-700')}>
                        {n.title}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {n.createdAt ? new Date(n.createdAt).toLocaleDateString() : ''}
                      </p>
                    </div>
                  ))
                )}
              </div>
              <Link
                to="/notifications/preferences"
                onClick={() => setShowBell(false)}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 border-t border-slate-100"
              >
                <Settings2 className="w-3.5 h-3.5" />
                <span>Notification preferences</span>
              </Link>
            </div>
          )}
        </div>

        {/* User Profile */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <div className="w-8 h-8 rounded-xl bg-brand-teal text-white flex items-center justify-center font-bold text-xs shadow-sm">
              {userName.charAt(0)}
            </div>
            <div className="hidden md:block text-left leading-tight pr-1">
              <p className="text-xs font-semibold text-slate-800">{userName}</p>
              <p className="text-[10px] text-slate-500 capitalize">{currentRole}</p>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-200/80 p-2 z-50 animate-in fade-in zoom-in-95">
              <div className="px-3 py-2 border-b border-slate-100">
                <p className="text-xs font-semibold text-slate-900">{userName}</p>
                <p className="text-[11px] text-slate-500 truncate">{userEmail}</p>
              </div>
              <div className="pt-1">
                <button
                  onClick={() => setShowUserMenu(false)}
                  className="w-full text-left px-3 py-1.5 rounded-lg text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span>My Profile & Preferences</span>
                </button>
                {onSignOut && (
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      onSignOut();
                    }}
                    className="w-full text-left px-3 py-1.5 rounded-lg text-xs text-red-600 hover:bg-red-50 flex items-center gap-2 border-t border-slate-100 mt-1"
                  >
                    <span>Sign Out</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
