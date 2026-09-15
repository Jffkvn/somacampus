import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopHeader } from './TopHeader';
import { CommandPalette } from '../ui/CommandPalette';
import { ToastProvider } from '../ui/Toast';
import { UserRole, getRoleLandingRoute } from '../../config/permissions';
import { useAuth } from '../../lib/authContext';

export const AppShell: React.FC = () => {
  const navigate = useNavigate();
  const { role, user, fullName, switchDevRole, signOut } = useAuth();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);

  // P1 — ⌘K / Ctrl+K command palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleRoleChange = (newRole: UserRole) => {
    switchDevRole(newRole);
    const landing = getRoleLandingRoute(newRole);
    navigate(landing);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <ToastProvider>
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {isMobileNavOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={() => setIsMobileNavOpen(false)}
        />
      )}

      <div className="print:hidden" data-print="hide">
        <Sidebar
          currentRole={role}
          isMobileOpen={isMobileNavOpen}
          onMobileClose={() => setIsMobileNavOpen(false)}
          isCollapsed={isCollapsed}
          onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
        />
      </div>

      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${
          isCollapsed ? 'lg:pl-20' : 'lg:pl-64'
        }`}
      >
        <TopHeader
          currentRole={role}
          userName={fullName}
          userEmail={user?.email || 'user@somacampus.ug'}
          onRoleChange={handleRoleChange}
          onSignOut={handleSignOut}
          onMobileMenuToggle={() => setIsMobileNavOpen(!isMobileNavOpen)}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-screen-2xl w-full mx-auto pb-16">
          <Outlet context={{ currentRole: role }} />
        </main>
      </div>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} role={role} />
    </div>
    </ToastProvider>
  );
};
