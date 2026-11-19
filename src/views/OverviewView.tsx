import { Award, BookOpen, Calendar, CreditCard, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import type { AcademyDataState } from '../hooks/useAcademyData';
import type { NavTabId } from '../components/AppShell';
import {
  ATTENDANCE_LABELS,
  ROLE_LABELS,
  formatCurrency,
  formatDateArabic,
} from '../shared/labels';
import { hasSupervisorPerm } from '../shared/policy';

interface OverviewViewProps {
  data: AcademyDataState;
  onNavigate: (tab: NavTabId) => void;
}

export function OverviewView({ data, onNavigate }: OverviewViewProps) {
  const { actor, academy } = useAuth();
  if (!actor) return null;

  const activeStudents = data.students.filter((s) => s.status === 'active');
  const activeGroups = data.groups.filter((g) => g.status === 'active');
  const totalInvoices = data.invoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);
  const totalPaid = data.invoices.reduce((sum, inv) => sum + (inv.paidAmount || 0), 0);

  const canSeeFinance = actor.role === 'owner' || hasSupervisorPerm(actor, 'finance');

  if (data.loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((n) => (
          <div
            key={n}
            className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Welcome Summary */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {academy?.name || 'الأكاديمية'} · {ROLE_LABELS[actor.role]}
            </p>
            <h2 className="mt-1 font-display text-2xl font-bold text-slate-900 dark:text-white">
              مرحبًا بك في لوحة التحكم
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {actor.role === 'owner' && 'لديك صلاحية كاملة لإدارة الأعضاء والمالية والرواتب وسجل التدقيق.'}
              {actor.role === 'supervisor' && 'تعرض هذه اللوحة الأقسام المفوضة لك فقط من مدير الأكاديمية.'}
              {actor.role === 'teacher' && 'تظهر هنا حلقاتك وطلابك المسندون إليك وسجلات الحضور والتقييم فقط.'}
              {actor.role === 'student' && 'تظهر هنا حلقاتك وسجل حضورك وتقييماتك ونقاطك الخاصة فقط.'}
              {actor.role === 'parent' && 'تظهر هنا بيانات الأبناء المرتبطين بحسابك رسميًا من الإدارة فقط.'}
            </p>
          </div>
          {actor.role === 'owner' && (
            <button
              type="button"
              onClick={() => onNavigate('members')}
              className="rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-800 whitespace-nowrap"
            >
              إضافة عضو جديد
            </button>
          )}
        </div>
      </section>

      {/* Role-Scoped Real KPIs */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">
              {actor.role === 'student'
                ? 'نقاطي المكتسبة'
                : actor.role === 'parent'
                  ? 'الأبناء المرتبطون'
                  : 'الطلاب النشطون'}
            </span>
            <Users className="h-4 w-4 text-teal-700 dark:text-teal-400" />
          </div>
          <p className="mt-3 font-display text-3xl font-bold text-slate-900 tabular-nums dark:text-white">
            {actor.role === 'student'
              ? activeStudents[0]?.points ?? 0
              : activeStudents.length}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">الحلقات النشطة</span>
            <BookOpen className="h-4 w-4 text-teal-700 dark:text-teal-400" />
          </div>
          <p className="mt-3 font-display text-3xl font-bold text-slate-900 tabular-nums dark:text-white">
            {activeGroups.length}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">الحصص المسجلة</span>
            <Calendar className="h-4 w-4 text-teal-700 dark:text-teal-400" />
          </div>
          <p className="mt-3 font-display text-3xl font-bold text-slate-900 tabular-nums dark:text-white">
            {data.sessions.length}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">
              {canSeeFinance ? 'التحصيل المالي' : 'التقييمات المسجلة'}
            </span>
            {canSeeFinance ? (
              <CreditCard className="h-4 w-4 text-teal-700 dark:text-teal-400" />
            ) : (
              <Award className="h-4 w-4 text-teal-700 dark:text-teal-400" />
            )}
          </div>
          <p className="mt-3 font-display text-2xl font-bold text-slate-900 tabular-nums dark:text-white">
            {canSeeFinance
              ? `${formatCurrency(totalPaid, academy?.currency)} / ${formatCurrency(totalInvoices, academy?.currency)}`
              : data.evaluations.length}
          </p>
        </div>
      </section>

      {/* Role-Specific Highlights */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Evaluations */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
              أحدث التقييمات والإنجازات
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('sessions_evals')}
              className="text-xs font-semibold text-teal-700 hover:underline dark:text-teal-400"
            >
              عرض الكل
            </button>
          </div>
          {data.evaluations.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              لا توجد تقييمات مسجلة في قاعدة البيانات حتى الآن.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.evaluations.slice(0, 5).map((ev) => (
                <div key={ev.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {ev.studentName}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                      {ev.surahOrLesson} · {formatDateArabic(ev.evaluatedAt)}
                    </p>
                  </div>
                  <div className="text-left shrink-0">
                    <p className="font-mono text-sm font-semibold text-teal-700 tabular-nums dark:text-teal-400">
                      +{ev.pointsAwarded} نقطة
                    </p>
                    <p className="text-xs text-slate-500 tabular-nums dark:text-slate-400">
                      حفظ {ev.memorizationScore}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Attendance or Audit Snapshot */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
              {actor.role === 'owner' ? 'آخر عمليات سجل التدقيق' : 'سجل الحضور الأخير'}
            </h3>
            <button
              type="button"
              onClick={() => onNavigate(actor.role === 'owner' ? 'crm_audit' : 'sessions_evals')}
              className="text-xs font-semibold text-teal-700 hover:underline dark:text-teal-400"
            >
              التفاصيل
            </button>
          </div>

          {actor.role === 'owner' ? (
            data.auditLogs.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                لا توجد أحداث تدقيق مسجلة بعد.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.auditLogs.slice(0, 5).map((log) => (
                  <div key={log.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {log.action}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                        {log.actorEmail} · {log.targetCollection}
                      </p>
                    </div>
                    <ShieldCheck className="h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" />
                  </div>
                ))}
              </div>
            )
          ) : data.attendance.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              لا توجد سجلات حضور مسجلة بعد.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.attendance.slice(0, 5).map((att) => (
                <div key={att.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {att.studentName}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 tabular-nums dark:text-slate-400">
                      {formatDateArabic(att.date)}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {ATTENDANCE_LABELS[att.status] || att.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
