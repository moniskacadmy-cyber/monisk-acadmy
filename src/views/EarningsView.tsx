import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Clock, Save, Wallet } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { callProtectedApi } from '../lib/apiClient';
import { formatDateArabic } from '../shared/labels';
import { formatDuration, isValidHourlyRate } from '../shared/earnings';

interface StudentRow {
  studentId: string;
  name: string;
  amount: number;
  sessions: number;
}

interface TeacherRow {
  uid: string;
  name: string;
  status: string;
  hourlyRate: number | null;
  sessions: number;
  minutes: number;
  amount: number;
  unassignedAmount: number;
  students: StudentRow[];
}

interface ReportRow {
  sessionId: string;
  title: string;
  groupName: string;
  teacherUid: string;
  teacherName: string;
  scheduledDate: string;
  durationMinutes: number;
  hourlyRate: number | null;
  amount: number;
  attendedCount: number;
  legacy: boolean;
}

interface Summary {
  month: string | null;
  currency: string;
  totals: { sessions: number; minutes: number; amount: number };
  teachers: TeacherRow[];
  reports: ReportRow[];
}

const currentMonth = () => new Date().toISOString().slice(0, 7);

function money(amount: number, currency: string): string {
  return `${Number(amount || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency}`;
}

export function EarningsView() {
  const { actor, academy } = useAuth();
  const [month, setMonth] = useState(currentMonth());
  const [allTime, setAllTime] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [rateDrafts, setRateDrafts] = useState<Record<string, string>>({});
  const [openTeacher, setOpenTeacher] = useState<string | null>(null);
  const [reportFilter, setReportFilter] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await callProtectedApi<Summary>('/api/earnings/summary', allTime ? {} : { month });
      setSummary(res);
      setRateDrafts(
        Object.fromEntries(res.teachers.map((t) => [t.uid, t.hourlyRate === null ? '' : String(t.hourlyRate)]))
      );
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'تعذر تحميل المستحقات.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, allTime]);

  if (!actor) return null;
  const currency = summary?.currency || academy?.currency || 'SAR';

  const saveRate = async (teacher: TeacherRow) => {
    setFeedback(null);
    const value = Number(rateDrafts[teacher.uid]);
    if (!isValidHourlyRate(value)) {
      setFeedback({ type: 'err', text: 'ريت الساعة يجب أن يكون رقمًا بين 0 و100000.' });
      return;
    }
    try {
      await callProtectedApi('/api/teachers/rate', { uid: teacher.uid, hourlyRate: value });
      setFeedback({ type: 'ok', text: `تم حفظ ريت ${teacher.name}. يُطبق على التقارير الجديدة فقط.` });
      await load();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'تعذر حفظ الريت.' });
    }
  };

  const backfill = async () => {
    setFeedback(null);
    try {
      const res = await callProtectedApi<{ created: number }>('/api/earnings/backfill', {});
      setFeedback({
        type: 'ok',
        text: res.created > 0 ? `تم احتساب ${res.created} حصة قديمة بالريت الحالي.` : 'لا توجد حصص قديمة تحتاج احتساب.',
      });
      await load();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'تعذر احتساب الحصص القديمة.' });
    }
  };

  const reports = (summary?.reports || []).filter((r) => !reportFilter || r.teacherUid === reportFilter);

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm font-medium ${
            feedback.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
              : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Period */}
      <section className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            الشهر
            <input
              type="month"
              dir="ltr"
              value={month}
              disabled={allTime}
              onChange={(e) => setMonth(e.target.value)}
              className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" checked={allTime} onChange={(e) => setAllTime(e.target.checked)} />
            كل الفترات
          </label>
        </div>
        <button
          type="button"
          onClick={() => void backfill()}
          className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          احتساب الحصص القديمة
        </button>
      </section>

      {/* Totals */}
      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="إجمالي المستحقات" value={money(summary?.totals.amount || 0, currency)} icon={Wallet} />
        <Stat label="عدد التقارير" value={String(summary?.totals.sessions ?? 0)} icon={Clock} />
        <Stat label="إجمالي الساعات" value={formatDuration(summary?.totals.minutes || 0)} icon={Clock} />
      </section>

      {/* Teachers */}
      <section className="space-y-3">
        <h2 className="font-display text-lg font-bold">المعلمون</h2>
        {loading && !summary ? (
          <p className="py-8 text-center text-sm text-slate-500">جاري التحميل...</p>
        ) : (summary?.teachers.length ?? 0) === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500 dark:border-slate-700">
            لا يوجد معلمون في الأكاديمية بعد.
          </p>
        ) : (
          summary!.teachers.map((t) => {
            const open = openTeacher === t.uid;
            return (
              <article key={t.uid} className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-center gap-4 p-5">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {t.name}
                      {t.status !== 'active' && (
                        <span className="ms-2 rounded bg-slate-200 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                          موقوف
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 tabular-nums">
                      {t.sessions} تقرير · {formatDuration(t.minutes)} ساعة
                      {t.hourlyRate === null && <span className="ms-2 text-amber-600">لم يتم تحديد ريت الساعة</span>}
                    </p>
                  </div>
                  <div className="text-end">
                    <p className="font-display text-xl font-bold text-teal-700 tabular-nums dark:text-teal-400">
                      {money(t.amount, currency)}
                    </p>
                    {t.unassignedAmount > 0 && (
                      <p className="text-[11px] text-amber-600">غير موزع على طلاب: {money(t.unassignedAmount, currency)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      dir="ltr"
                      placeholder="ريت الساعة"
                      value={rateDrafts[t.uid] ?? ''}
                      onChange={(e) => setRateDrafts((prev) => ({ ...prev, [t.uid]: e.target.value }))}
                      className="w-28 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums dark:border-slate-700 dark:bg-slate-950"
                    />
                    <button
                      type="button"
                      onClick={() => void saveRate(t)}
                      className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-800"
                    >
                      <Save className="h-3.5 w-3.5" />
                      حفظ
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenTeacher(open ? null : t.uid)}
                      className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                      aria-label="التفاصيل"
                    >
                      {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {open && (
                  <div className="space-y-4 border-t border-slate-200 p-5 dark:border-slate-800">
                    <div>
                      <h3 className="mb-2 text-sm font-bold">ما حصّله المعلم من كل طالب</h3>
                      {t.students.length === 0 ? (
                        <p className="text-xs text-slate-500">لا توجد حضورات مسجلة بعد.</p>
                      ) : (
                        <table className="w-full text-right text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800">
                              <th className="py-2">الطالب</th>
                              <th className="py-2">عدد الحصص</th>
                              <th className="py-2">المبلغ</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {t.students.map((s) => (
                              <tr key={s.studentId}>
                                <td className="py-2 font-semibold">{s.name}</td>
                                <td className="py-2 tabular-nums">{s.sessions}</td>
                                <td className="py-2 font-mono tabular-nums">{money(s.amount, currency)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setReportFilter(t.uid);
                        document.getElementById('reports-section')?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="text-xs font-semibold text-teal-700 hover:underline dark:text-teal-400"
                    >
                      عرض تقارير هذا المعلم
                    </button>
                  </div>
                )}
              </article>
            );
          })
        )}
      </section>

      {/* Reports */}
      <section id="reports-section" className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold">التقارير ({reports.length})</h2>
          <select
            value={reportFilter}
            onChange={(e) => setReportFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="">كل المعلمين</option>
            {summary?.teachers.map((t) => (
              <option key={t.uid} value={t.uid}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {reports.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">لا توجد تقارير في هذه الفترة.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800">
                  <th className="py-2.5 pe-4">التاريخ</th>
                  <th className="py-2.5 px-4">المعلم</th>
                  <th className="py-2.5 px-4">الحلقة / الحصة</th>
                  <th className="py-2.5 px-4">المدة</th>
                  <th className="py-2.5 px-4">الريت</th>
                  <th className="py-2.5 px-4">الحضور</th>
                  <th className="py-2.5 ps-4">المبلغ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {reports.map((r) => (
                  <tr key={r.sessionId}>
                    <td className="py-3 pe-4 text-xs tabular-nums">{formatDateArabic(r.scheduledDate)}</td>
                    <td className="py-3 px-4 font-semibold">{r.teacherName}</td>
                    <td className="py-3 px-4 text-xs">
                      <p className="font-semibold">{r.groupName}</p>
                      <p className="text-slate-500">{r.title}</p>
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums">{formatDuration(r.durationMinutes)}</td>
                    <td className="py-3 px-4 font-mono tabular-nums text-xs">
                      {r.hourlyRate === null ? <span className="text-amber-600">—</span> : money(r.hourlyRate, currency)}
                    </td>
                    <td className="py-3 px-4 tabular-nums">{r.attendedCount}</td>
                    <td className="py-3 ps-4 font-mono font-bold tabular-nums">
                      {money(r.amount, currency)}
                      {r.legacy && <span className="ms-1 text-[10px] font-normal text-slate-500">(قديم)</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
        <span className="text-xs font-medium">{label}</span>
        <Icon className="h-4 w-4 text-teal-700 dark:text-teal-400" />
      </div>
      <p className="mt-3 font-display text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}
