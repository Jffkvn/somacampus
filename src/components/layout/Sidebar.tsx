import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronRight, X, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NAVIGATION_CONFIG } from '../../config/navigation';
import { UserRole } from '../../config/permissions';
import { SomaCampusLogo } from '../brand/SomaCampusLogo';
import { cn } from '../../lib/utils';

export interface SidebarProps {
  currentRole: UserRole;
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentRole,
  isMobileOpen = false,
  onMobileClose,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const location = useLocation();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    teaching: true,
    academics: true,
    students: false,
    finance: false,
    administration: false,
    staff_portal: false,
  });

  // Auto-expand accordion if child route is active
  useEffect(() => {
    NAVIGATION_CONFIG.forEach((group) => {
      if (group.subItems) {
        const hasActiveChild = group.subItems.some((sub) =>
          location.pathname.startsWith(sub.href)
        );
        if (hasActiveChild) {
          setExpandedGroups((prev) => ({ ...prev, [group.id]: true }));
        }
      }
    });
  }, [location.pathname]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  // Filter groups by current user's role
  const visibleGroups = NAVIGATION_CONFIG.filter(
    (group) => !group.roles || group.roles.includes(currentRole)
  );

  return (
    <aside
      className={cn(
        'fixed top-0 bottom-0 left-0 z-40 flex flex-col transition-all duration-300 select-none shadow-2xl',
        'bg-[#002b36] border-r border-[#003847]/80',
        isCollapsed ? 'w-20' : 'w-64',
        // Mobile Drawer Handling
        isMobileOpen
          ? 'translate-x-0'
          : '-translate-x-full lg:translate-x-0'
      )}
    >
      {/* Brand Header */}
      <div className="h-18 px-4 flex items-center justify-between border-b border-[#003847]">
        {!isCollapsed ? (
          <SomaCampusLogo variant="full" size="sm" theme="dark" />
        ) : (
          <SomaCampusLogo variant="icon" size="sm" theme="dark" />
        )}
        <div className="flex items-center gap-1">
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCollapsed ? (
                <PanelLeftOpen className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </button>
          )}
          {onMobileClose && (
            <button
              onClick={onMobileClose}
              className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5 custom-scrollbar">
        {visibleGroups.map((group) => {
          const Icon = group.icon;
          const isExpanded = expandedGroups[group.id];

          // Top-level direct link (e.g. Today)
          if (!group.subItems || group.subItems.length === 0) {
            return (
              <NavLink
                key={group.id}
                to={group.href || '#'}
                onClick={onMobileClose}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-all duration-150',
                    isActive
                      ? 'bg-brand-teal/25 text-white border-l-4 border-brand-tealLight font-semibold shadow-inner'
                      : 'text-slate-300 hover:text-white hover:bg-white/5'
                  )
                }
              >
                <Icon className="w-5 h-5 flex-shrink-0 text-slate-300" />
                {!isCollapsed && <span>{group.label}</span>}
              </NavLink>
            );
          }

          // Expandable accordion group
          const visibleSubItems = group.subItems.filter(
            (sub) => !sub.roles || sub.roles.includes(currentRole)
          );

          if (visibleSubItems.length === 0) return null;

          const isGroupActive = visibleSubItems.some((sub) =>
            location.pathname.startsWith(sub.href)
          );

          return (
            <div key={group.id} className="space-y-1">
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium text-sm transition-all duration-150',
                  isGroupActive
                    ? 'text-white bg-white/5'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon className={cn('w-5 h-5 flex-shrink-0', isGroupActive ? 'text-brand-tealLight' : 'text-slate-400')} />
                  {!isCollapsed && <span>{group.label}</span>}
                </div>
                {!isCollapsed && (
                  <span className="text-slate-400">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </span>
                )}
              </button>

              {/* Submenu Accordion */}
              {!isCollapsed && isExpanded && (
                <div className="pl-9 pr-2 py-1 space-y-1">
                  {visibleSubItems.map((sub) => (
                    <NavLink
                      key={sub.href}
                      to={sub.href}
                      onClick={onMobileClose}
                      className={({ isActive }) =>
                        cn(
                          'block px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150',
                          isActive
                            ? 'bg-brand-teal/30 text-white font-semibold border-l-2 border-brand-tealLight'
                            : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'
                        )
                      }
                    >
                      {sub.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Sidebar Footer with School Context */}
      {!isCollapsed && (
        <div className="p-4 border-t border-[#003847] bg-[#00222b]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-teal/30 border border-brand-teal/40 flex items-center justify-center font-bold text-xs text-white">
              SC
            </div>
            <div className="overflow-hidden leading-tight">
              <p className="text-xs font-semibold text-white truncate">Grace's Cambridge Centre</p>
              <p className="text-[10px] text-slate-400">Kampala • Term 1, 2026</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
