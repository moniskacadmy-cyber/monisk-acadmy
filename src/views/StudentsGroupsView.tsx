import React, { useState } from 'react';
import { Archive, BookOpen, Edit3, Plus, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import type { AcademyDataState } from '../hooks/useAcademyData';
import { callProtectedApi } from '../lib/apiClient';
import { hasSupervisorPerm } from '../shared/policy';
import { SUPPORTED_CURRENCIES } from '../shared/currency';
import type { GroupDoc, StudentDoc } from '../shared/types';

export function StudentsGroupsView({ data }: { data: AcademyDataState }) {
  const { actor, academy } = useAuth();
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Student form state
  const [editingStudent, setEditingStudent] = useState<StudentDoc | null>(null);
  const [fullName, setFullName] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [studentPassword, setStudentPassword] = useState('');
  const [studentPhone, setStudentPhone] = useState('');
  const [track, setTrack] = useState('القرآن الكريم');
  const [level, setLevel] = useState('المستوى الأول');
  const [studentCurrency, setStudentCurrency] = useState('EGP');

  // Group form state
  const [editingGroup, setEditingGroup] = useState<GroupDoc | null>(null);
  const [groupName, setGroupName] = useState('');
  const [subject, setSubject] = useState('تحفيظ ومراجعة');
  const [teacherUid, setTeacherUid] = useState('');
  const [scheduleText, setScheduleText] = useState('الأحد والثلاثاء 5:00 مساءً');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  if (!actor) return null;

  const canManageStudents = actor.role === 'owner' || hasSupervisorPerm(actor, 'students');
  const canManageGroups = actor.role === 'owner' || hasSupervisorPerm(actor, 'groups');

  const teachers = data.members.filter((m) => m.role === 'teacher' && m.status === 'active');

  const resetStudentForm = () => {
    setEditingStudent(null);
    setFullName('');
    setStudentEmail('');
    setStudentPassword('');
    setStudentPhone('');
    setTrack('القرآن الكريم');
    setLevel('المستوى الأول');
    setStudentCurrency('EGP');
  };

  const resetGroupForm = () => {
    setEditingGroup(null);
    setGroupName('');
    setSubject('تحفيظ ومراجعة');
    setTeacherUid('');
    setScheduleText('الأحد والثلاثاء 5:00 مساءً');
    setSelectedStudentIds([]);
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      await callProtectedApi('/api/students/upsert', {
        id: editingStudent?.id,
        fullName,
        email: studentEmail,
        password: studentPassword,
        phone: studentPhone,
        track,
        level,
        currency: studentCurrency,
      });
      setFeedback({ type: 'ok', text: 'تم حفظ بيانات الطالب في Firestore بنجاح.' });
      resetStudentForm();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'تعذر حفظ الطالب.' });
    }
  };

  const handleArchiveStudent = async (student: StudentDoc) => {
    setFeedback(null);
    const nextStatus = student.status === 'active' ? 'archived' : 'active';
    try {
      await callProtectedApi('/api/students/archive', {
        studentId: student.id,
        status: nextStatus,
      });
      setFeedback({
        type: 'ok',
        text: nextStatus === 'archived' ? 'تمت أرشفة الطالب.' : 'تمت استعادة الطالب.',
      });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'تعذر تحديث حالة الطالب.' });
    }
  };

  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      await callProtectedApi('/api/groups/upsert', {
        id: editingGroup?.id,
        name: groupName,
        subject,
        teacherUid,
        scheduleText,
        studentIds: selectedStudentIds,
      });
      setFeedback({
        type: 'ok',
        text: 'تم حفظ الحلقة ومزامنة صلاحيات المعلم والطلاب في Firestore بنجاح.',
      });
      resetGroupForm();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'تعذر حفظ الحلقة.' });
    }
  };

  const handleArchiveGroup = async (group: GroupDoc) => {
    setFeedback(null);
    const nextStatus = group.status === 'active' ? 'archived' : 'active';
    try {
      await callProtectedApi('/api/groups/archive', {
        groupId: group.id,
        status: nextStatus,
      });
      setFeedback({
        type: 'ok',
        text: nextStatus === 'archived' ? 'تمت أرشفة الحلقة.' : 'تمت استعادة الحلقة.',
      });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'تعذر أرشفة الحلقة.' });
    }
  };

  const toggleStudentInGroup = (sid: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(sid) ? prev.filter((id) => id !== sid) : [...prev, sid]
    );
  };

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

      {/* Groups Section */}
      {canManageGroups && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-teal-700 dark:text-teal-400" />
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                {editingGroup ? `تعديل الحلقة: ${editingGroup.name}` : 'إنشاء حلقة / مجموعة دراسية'}
              </h2>
            </div>
            {editingGroup && (
              <button type="button" onClick={resetGroupForm} className="text-xs text-slate-500 hover:underline">
                إلغاء التعديل
              </button>
            )}
          </div>

          <form onSubmit={(e) => void handleSaveGroup(e)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium">اسم الحلقة</label>
                <input
                  type="text"
                  required
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="مثال: حلقة الفجر"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">المادة / المسار</label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">المعلم المسؤول</label>
                <select
                  required
                  value={teacherUid}
                  onChange={(e) => setTeacherUid(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="">اختر المعلم...</option>
                  {teachers.map((t) => (
                    <option key={t.uid} value={t.uid}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">الموعد</label>
                <input
                  type="text"
                  value={scheduleText}
                  onChange={(e) => setScheduleText(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                الطلاب المسجلون في الحلقة ({selectedStudentIds.length}):
              </p>
              {data.students.filter((s) => s.status === 'active').length === 0 ? (
                <p className="text-xs text-slate-500">أضف طلابًا أولًا لتعيينهم داخل الحلقة.</p>
              ) : (
                <div className="grid max-h-40 gap-2 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
                  {data.students
                    .filter((s) => s.status === 'active')
                    .map((s) => (
                      <label
                        key={s.id}
                        className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={selectedStudentIds.includes(s.id)}
                          onChange={() => toggleStudentInGroup(s.id)}
                          className="accent-teal-700"
                        />
                        <span className="truncate">{s.fullName}</span>
                      </label>
                    ))}
                </div>
              )}
            </div>

            <button
              type="submit"
              className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
            >
              {editingGroup ? 'تحديث الحلقة' : 'إنشاء الحلقة'}
            </button>
          </form>
        </section>
      )}

      {/* Groups List */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-teal-700 dark:text-teal-400" />
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            الحلقات والمجموعات ({data.groups.length})
          </h2>
        </div>

        {data.groups.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">لا توجد حلقات مسجلة حاليًا.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.groups.map((g) => (
              <div
                key={g.id}
                className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-display text-base font-bold text-slate-900 dark:text-white">
                      {g.name}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {g.subject} · المعلم: {g.teacherName}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-semibold ${
                      g.status === 'active'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-slate-400'
                    }`}
                  >
                    {g.status === 'active' ? 'نشطة' : 'مؤرشفة'}
                  </span>
                </div>
                <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">
                  {g.scheduleText || '—'} · <span className="tabular-nums">{g.studentIds.length}</span> طالب
                </p>
                {canManageGroups && (
                  <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingGroup(g);
                        setGroupName(g.name);
                        setSubject(g.subject);
                        setTeacherUid(g.teacherUid);
                        setScheduleText(g.scheduleText);
                        setSelectedStudentIds(g.studentIds || []);
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      <span>تعديل</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleArchiveGroup(g)}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      <Archive className="h-3.5 w-3.5" />
                      <span>{g.status === 'active' ? 'أرشفة' : 'استعادة'}</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Add/Edit Student Form */}
      {canManageStudents && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              {editingStudent ? `تعديل بيانات الطالب: ${editingStudent.fullName}` : 'إضافة طالب جديد'}
            </h2>
            {editingStudent && (
              <button type="button" onClick={resetStudentForm} className="text-xs text-slate-500 hover:underline">
                إلغاء التعديل
              </button>
            )}
          </div>
          <form onSubmit={(e) => void handleSaveStudent(e)} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="اسم الطالب الكامل"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
            {!editingStudent && (
              <>
                <input
                  type="email"
                  required
                  dir="ltr"
                  value={studentEmail}
                  onChange={(e) => setStudentEmail(e.target.value)}
                  placeholder="student@academy.com"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
                <input
                  type="password"
                  required
                  minLength={8}
                  dir="ltr"
                  value={studentPassword}
                  onChange={(e) => setStudentPassword(e.target.value)}
                  placeholder="كلمة مرور الحساب (8+)"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </>
            )}
            <input
              type="tel"
              dir="ltr"
              value={studentPhone}
              onChange={(e) => setStudentPhone(e.target.value)}
              placeholder="رقم الهاتف (اختياري)"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
            <input
              type="text"
              value={track}
              onChange={(e) => setTrack(e.target.value)}
              placeholder="المسار (مثال: القرآن الكريم)"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
            <input
              type="text"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              placeholder="المستوى"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">عملة الطالب</label>
              <select
                value={studentCurrency}
                onChange={(e) => setStudentCurrency(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                {SUPPORTED_CURRENCIES.map((currency) => (
                  <option key={currency.code} value={currency.code}>{currency.label}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <button
                type="submit"
                className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
              >
                {editingStudent ? 'حفظ التعديلات' : 'إنشاء الطالب'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Students Directory */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center gap-2">
          <Users className="h-5 w-5 text-teal-700 dark:text-teal-400" />
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            سجل الطلاب ({data.students.length})
          </h2>
        </div>

        {data.students.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">لا يوجد طلاب ضمن نطاق صلاحياتك حاليًا.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-3 pl-4 font-medium">الطالب</th>
                  <th className="py-3 px-4 font-medium">المسار والمستوى</th>
                  <th className="py-3 px-4 font-medium">العملة</th>
                  <th className="py-3 px-4 font-medium">النقاط</th>
                  <th className="py-3 px-4 font-medium">الحالة</th>
                  {canManageStudents && <th className="py-3 pr-4 font-medium">إجراءات</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.students.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 pl-4">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{s.fullName}</p>
                      <p className="font-mono text-xs text-slate-500" dir="ltr">
                        {s.email}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700 dark:text-slate-300">
                      {s.track} · {s.level}
                    </td>
                    <td className="py-3 px-4 text-xs font-mono">{s.currency || academy?.currency || 'EGP'}</td>
                    <td className="py-3 px-4 font-mono text-sm font-semibold text-teal-700 tabular-nums dark:text-teal-400">
                      {s.points || 0}
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <span className={s.status === 'active' ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400'}>
                        {s.status === 'active' ? 'نشط' : 'مؤرشف'}
                      </span>
                    </td>
                    {canManageStudents && (
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingStudent(s);
                              setFullName(s.fullName);
                              setStudentPhone(s.phone || '');
                              setStudentCurrency(s.currency || academy?.currency || 'EGP');
                              setTrack(s.track);
                              setLevel(s.level);
                            }}
                            className="rounded-md border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                          >
                            تعديل
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleArchiveStudent(s)}
                            className="rounded-md border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                          >
                            {s.status === 'active' ? 'أرشفة' : 'استعادة'}
                          </button>
                        </div>
                      </td>
                    )}
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
