import React, { useState } from 'react';
import {
  Bell,
  BookOpen,
  CalendarCheck,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  ShieldCheck,
  Sun,
  TrendingUp,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { hasSupervisorPerm } from '../shared/policy';
import { ROLE_LABELS, formatDateArabic } from '../shared/labels';
import type { NotificationDoc } from '../shared/types';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../lib/firebase';

export type NavTabId =
  | 'overview'
  | 'members'
  | 'students_groups'
  | 'sessions_evals'
  | 'crm_audit'
  | 'chat'
  | 'earnings'
  | 'comms_resources';

interface NavItem {
  id: NavTabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  visible: boolean;
}

interface AppShellProps {
  activeTab: NavTabId;
  onSelectTab: (tab: NavTabId) => void;
  notifications: NotificationDoc[];
  children: React.ReactNode;
}

export function AppShell({
  activeTab,
  onSelectTab,
  notifications,
  children,
}: AppShellProps) {
  const { actor, academy, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  if (!actor) return null;

  const canMembers =
    actor.role === 'owner' ||
    hasSupervisorPerm(actor, 'supervisors') ||
    hasSupervisorPerm(actor, 'teachers') ||
    hasSupervisorPerm(actor, 'students') ||
    hasSupervisorPerm(actor, 'parents');

  const canStudentsGroups =
    actor.role === 'owner' ||
    actor.role === 'teacher' ||
    hasSupervisorPerm(actor, 'students') ||
    hasSupervisorPerm(actor, 'groups');

  const canEarnings = actor.role === 'owner' || actor.role === 'supervisor';

  const canCrmOrAudit = actor.role === 'owner' || hasSupervisorPerm(actor, 'crm');

  const navItems: NavItem[] = [
    { id: 'overview', label: 'الرئيسية', icon: LayoutDashboard, visible: true },
    { id: 'members', label: 'الأعضاء والصلاحيات', icon: Users, visible: canMembers },
    {
      id: 'students_groups',
      label: actor.role === 'teacher' ? 'طلابي وحلقاتي' : 'الطلاب والحلقات',
      icon: BookOpen,
      visible: canStudentsGroups,
    },
    {
      id: 'sessions_evals',
      label:
        actor.role === 'student' || actor.role === 'parent'
          ? 'الحضور والتقييمات'
          : 'الحصص والتقييمات',
      icon: CalendarCheck,
      visible: true,
    },
    {
      id: 'crm_audit',
      label: actor.role === 'owner' ? 'CRM وسجل التدقيق' : 'طلبات التسجيل CRM',
      icon: actor.role === 'owner' ? ShieldCheck : TrendingUp,
      visible: canCrmOrAudit,
    },
    {
      id: 'earnings',
      label: 'المستحقات والتقارير',
      icon: Wallet,
      visible: canEarnings,
    },
    {
      id: 'chat',
      label: 'المحادثات',
      icon: MessageSquare,
      visible: true,
    },
    {
      id: 'comms_resources',
      label: 'الملفات والإشعارات',
      icon: FolderOpen,
      visible: true,
    },
  ];

  const visibleNav = navItems.filter((item) => item.visible);
  const unreadCount = notifications.filter((n) => !n.readBy?.includes(actor.uid)).length;
  const activeItem = visibleNav.find((i) => i.id === activeTab) || visibleNav[0];

  const markAsRead = async (notifId: string) => {
    try {
      await updateDoc(doc(db, 'academies', actor.academyId, 'notifications', notifId), {
        readBy: arrayUnion(actor.uid),
      });
    } catch {
      // Ignore silent read update error
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Right-Hand RTL Sidebar */}
      <aside
        className={`fixed top-0 right-0 z-50 flex h-full w-64 flex-col border-l border-slate-200 bg-white transition-transform duration-200 dark:border-slate-800 dark:bg-slate-900 lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5 dark:border-slate-800">
          <div className="min-w-0">
            <p className="truncate font-display text-base font-bold text-slate-900 dark:text-white">
              {academy?.name || 'منصة الأكاديميات'}
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {ROLE_LABELS[actor.role]}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"
            aria-label="إغلاق القائمة"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === activeTab;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-teal-700 text-white dark:bg-teal-600'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-4 dark:border-slate-800">
          <div className="mb-3 min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {actor.email}
            </p>
            <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
              {ROLE_LABELS[actor.role]} · {actor.academyId}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <LogOut className="h-4 w-4" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="lg:pr-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden"
              aria-label="فتح القائمة"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="truncate font-display text-lg font-bold text-slate-900 dark:text-white">
              {activeItem?.label}
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((prev) => !prev)}
                className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                aria-label="الإشعارات"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -left-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-teal-700 px-1 font-mono text-[11px] font-semibold text-white tabular-nums">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute left-0 top-12 z-50 w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">الإشعارات</h2>
                    <button
                      type="button"
                      onClick={() => setNotifOpen(false)}
                      className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    >
                      إغلاق
                    </button>
                  </div>
                  {notifications.length === 0 ? (
                    <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                      لا توجد إشعارات حاليًا.
                    </p>
                  ) : (
                    <div className="max-h-72 space-y-2 overflow-y-auto">
                      {notifications.slice(0, 10).map((n) => {
                        const isRead = n.readBy?.includes(actor.uid);
                        return (
                          <button
                            key={n.id}
                            type="button"
                            onClick={() => void markAsRead(n.id)}
                            className={`w-full rounded-lg border p-3 text-right transition-colors ${
                              isRead
                                ? 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950'
                                : 'border-teal-200 bg-teal-50/50 dark:border-teal-900 dark:bg-teal-950/30'
                            }`}
                          >
                            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                              {n.title}
                            </p>
                            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                              {n.body}
                            </p>
                            <p className="mt-1.5 text-[11px] text-slate-400 tabular-nums">
                              {formatDateArabic(n.createdAt)}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={toggleTheme}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="تبديل الوضع الليلي والنهاري"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
