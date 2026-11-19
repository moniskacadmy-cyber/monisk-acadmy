import React, { useState } from 'react';
import { Award, CalendarCheck, CheckSquare } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import type { AcademyDataState } from '../hooks/useAcademyData';
import { callProtectedApi } from '../lib/apiClient';
import { ATTENDANCE_LABELS, formatDateArabic } from '../shared/labels';
import { hasSupervisorPerm } from '../shared/policy';

export function SessionsEvaluationsView({ data }: { data: AcademyDataState }) {
  const { actor } = useAuth();
  const [groupId, setGroupId] = useState('');
  const [title, setTitle] = useState('');
  const [scheduledDate, setScheduledDate] = useState(new Date().toISOString().slice(0, 10));
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [notes, setNotes] = useState('');

  // Quick student attendance & evaluation inside session form
  const [attendanceMap, setAttendanceMap] = useState<Record<string, string>>({});
  const [evalStudentId, setEvalStudentId] = useState('');
  const [surahOrLesson, setSurahOrLesson] = useState('');
  const [memorizationScore, setMemorizationScore] = useState(95);
  const [revisionScore, setRevisionScore] = useState(90);
  const [recitationScore, setRecitationScore] = useState(92);
  const [pointsAwarded, setPointsAwarded] = useState(15);
  const [certificateTitle, setCertificateTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  if (!actor) return null;

  const canRecord =
    actor.role === 'owner' ||
    actor.role === 'teacher' ||
    hasSupervisorPerm(actor, 'groups');

  const selectedGroup = data.groups.find((g) => g.id === groupId);
  const groupStudents = selectedGroup
    ? data.students.filter((s) => selectedGroup.studentIds.includes(s.id))
    : [];

  const handleRecordSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSubmitting(true);

    try {
      const attendance = groupStudents.map((s) => ({
        studentId: s.id,
        status: attendanceMap[s.id] || 'present',
      }));

      const evaluations =
        evalStudentId && surahOrLesson
          ? [
              {
                studentId: evalStudentId,
                surahOrLesson,
                memorizationScore,
                revisionScore,
                recitationScore,
                pointsAwarded,
                certificateTitle: certificateTitle || undefined,
              },
            ]
          : [];

      await callProtectedApi('/api/sessions/record', {
        groupId,
        title,
        scheduledDate,
        durationMinutes,
        notes,
        status: 'completed',
        attendance,
        evaluations,
      });

      setFeedback({
        type: 'ok',
        text: 'تم تسجيل الحصة وسجل الحضور والتقييمات في Firestore بنجاح.',
      });
      setTitle('');
      setNotes('');
      setSurahOrLesson('');
      setCertificateTitle('');
      setEvalStudentId('');
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'تعذر تسجيل الحصة.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const certificates = data.evaluations.filter((e) => Boolean(e.certificateTitle));

  return (
    <div className="space-y-8">
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

      {/* Teacher / Admin Session Logger */}
      {canRecord && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-teal-700 dark:text-teal-400" />
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              تسجيل حصة وحضور وتقييم
            </h2>
          </div>

          <form onSubmit={(e) => void handleRecordSession(e)} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium">الحلقة</label>
                <select
                  required
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="">اختر الحلقة...</option>
                  {data.groups
                    .filter((g) => g.status === 'active')
                    .map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium">عنوان الحصة</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثال: تسميع سورة الملك"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium">التاريخ</label>
                <input
                  type="date"
                  dir="ltr"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums dark:border-slate-700 dark:bg-slate-950"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium">المدة (بالدقائق)</label>
                <input
                  type="number"
                  min={10}
                  max={240}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
            </div>

            {groupStudents.length > 0 && (
              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <p className="mb-3 flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                  <CheckSquare className="h-4 w-4 text-teal-700" />
                  <span>تحضير طلاب الحلقة</span>
                </p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {groupStudents.map((st) => (
                    <div
                      key={st.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-700"
                    >
                      <span className="truncate font-medium">{st.fullName}</span>
                      <select
                        value={attendanceMap[st.id] || 'present'}
                        onChange={(e) =>
                          setAttendanceMap((prev) => ({ ...prev, [st.id]: e.target.value }))
                        }
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
                      >
                        <option value="present">حاضر</option>
                        <option value="late">متأخر</option>
                        <option value="excused">معذور</option>
                        <option value="absent">غائب</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Optional Evaluation in Session */}
            {groupStudents.length > 0 && (
              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <p className="mb-3 text-xs font-bold text-slate-800 dark:text-slate-200">
                  إضافة تقييم / شهادة لطالب (اختياري)
                </p>
                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <select
                    value={evalStudentId}
                    onChange={(e) => setEvalStudentId(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                  >
                    <option value="">اختر طالبًا للتقييم...</option>
                    {groupStudents.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.fullName}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={surahOrLesson}
                    onChange={(e) => setSurahOrLesson(e.target.value)}
                    placeholder="السورة / الدرس"
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={memorizationScore}
                    onChange={(e) => setMemorizationScore(Number(e.target.value))}
                    placeholder="الحفظ %"
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs tabular-nums dark:border-slate-700 dark:bg-slate-950"
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={revisionScore}
                    onChange={(e) => setRevisionScore(Number(e.target.value))}
                    placeholder="المراجعة %"
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs tabular-nums dark:border-slate-700 dark:bg-slate-950"
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={recitationScore}
                    onChange={(e) => setRecitationScore(Number(e.target.value))}
                    placeholder="التلاوة %"
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs tabular-nums dark:border-slate-700 dark:bg-slate-950"
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={pointsAwarded}
                    onChange={(e) => setPointsAwarded(Number(e.target.value))}
                    placeholder="النقاط"
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs tabular-nums dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <input
                  type="text"
                  value={certificateTitle}
                  onChange={(e) => setCertificateTitle(e.target.value)}
                  placeholder="عنوان شهادة أو وسام (اختياري، مثال: شهادة إتمام جزء عم)"
                  className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
            >
              {submitting ? 'جاري الحفظ...' : 'حفظ الحصة والحضور'}
            </button>
          </form>
        </section>
      )}

      {/* Certificates Section (Visible to Student/Parent/Staff) */}
      {certificates.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-2">
            <Award className="h-5 w-5 text-teal-700 dark:text-teal-400" />
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              الشهادات والأوسمة المعتمدة
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {certificates.map((cert) => (
              <div
                key={cert.id}
                className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"
              >
                <p className="font-display text-base font-bold text-teal-700 dark:text-teal-400">
                  {cert.certificateTitle}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                  {cert.studentName}
                </p>
                <p className="mt-1 text-xs text-slate-500 tabular-nums">
                  {cert.surahOrLesson} · {formatDateArabic(cert.evaluatedAt)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Attendance & Evaluations Tables */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-4 font-display text-base font-bold text-slate-900 dark:text-white">
            سجل الحضور ({data.attendance.length})
          </h3>
          {data.attendance.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">لا توجد سجلات حضور مسجلة.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.attendance.slice(0, 25).map((a) => (
                <div key={a.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{a.studentName}</p>
                    <p className="text-xs text-slate-500 tabular-nums">{formatDateArabic(a.date)}</p>
                  </div>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {ATTENDANCE_LABELS[a.status] || a.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-4 font-display text-base font-bold text-slate-900 dark:text-white">
            سجل التقييمات ({data.evaluations.length})
          </h3>
          {data.evaluations.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">لا توجد تقييمات مسجلة.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.evaluations.slice(0, 25).map((ev) => (
                <div key={ev.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      {ev.studentName} · {ev.surahOrLesson}
                    </p>
                    <p className="text-xs text-slate-500 tabular-nums">
                      حفظ {ev.memorizationScore}% · مراجعة {ev.revisionScore}% · تلاوة {ev.recitationScore}%
                    </p>
                  </div>
                  <span className="font-mono text-xs font-bold text-teal-700 tabular-nums dark:text-teal-400">
                    +{ev.pointsAwarded}
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
