import React, { useEffect, useMemo, useState } from 'react';
import { Link2, Shield, UserPlus, UserX, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import type { AcademyDataState } from '../hooks/useAcademyData';
import { callProtectedApi } from '../lib/apiClient';
import { PERMISSION_LABELS, ROLE_LABELS, formatDateArabic } from '../shared/labels';
import { hasSupervisorPerm } from '../shared/policy';
import {
  ALL_SUPERVISOR_PERMISSIONS,
  type AcademyRole,
  type MemberDoc,
  type SupervisorPermission,
} from '../shared/types';

export function MembersView({ data }: { data: AcademyDataState }) {
  const { actor } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<AcademyRole>('teacher');
  const [perms, setPerms] = useState<SupervisorPermission[]>(['students', 'groups']);
  const [track, setTrack] = useState('القرآن الكريم');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Parent Link state
  const [linkParentUid, setLinkParentUid] = useState('');
  const [linkStudentId, setLinkStudentId] = useState('');
  const [linkRelation, setLinkRelation] = useState('والد / ولي أمر');

  // Edit supervisor perms modal state
  const [editingSupervisor, setEditingSupervisor] = useState<MemberDoc | null>(null);
  const [editingPerms, setEditingPerms] = useState<SupervisorPermission[]>([]);

  const allowedCreatableRoles = useMemo<AcademyRole[]>(() => {
    if (!actor) return [];
    const roles: AcademyRole[] = [];
    if (actor.role === 'owner' || hasSupervisorPerm(actor, 'supervisors')) {
      roles.push('supervisor');
    }
    if (actor.role === 'owner' || hasSupervisorPerm(actor, 'teachers')) {
      roles.push('teacher');
    }
    if (actor.role === 'owner' || hasSupervisorPerm(actor, 'students')) {
      roles.push('student');
    }
    if (
      actor.role === 'owner' ||
      hasSupervisorPerm(actor, 'parents') ||
      hasSupervisorPerm(actor, 'students')
    ) {
      roles.push('parent');
    }
    return roles;
  }, [actor]);

  const effectiveRole: AcademyRole | undefined = allowedCreatableRoles.includes(role)
    ? role
    : allowedCreatableRoles[0];

  useEffect(() => {
    if (effectiveRole && role !== effectiveRole) {
      setRole(effectiveRole);
    }
  }, [effectiveRole, role]);

  if (!actor) return null;

  const togglePerm = (perm: SupervisorPermission, list: SupervisorPermission[], setList: (v: SupervisorPermission[]) => void) => {
    setList(list.includes(perm) ? list.filter((p) => p !== perm) : [...list, perm]);
  };

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveRole) {
      setFeedback({ type: 'err', text: 'ليس لديك صلاحية لإضافة أعضاء جدد.' });
      return;
    }

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPhone = phone.trim();
    const trimmedTrack = track.trim() || 'القرآن الكريم';

    if (trimmedName.length < 2) {
      setFeedback({ type: 'err', text: 'يرجى إدخال الاسم الكامل (حرفان على الأقل).' });
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setFeedback({ type: 'err', text: 'يرجى إدخال بريد إلكتروني صحيح.' });
      return;
    }
    if (password.length < 8) {
      setFeedback({ type: 'err', text: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.' });
      return;
    }

    setFeedback(null);
    setSubmitting(true);
    try {
      await callProtectedApi('/api/members/create', {
        name: trimmedName,
        email: trimmedEmail,
        password,
        phone: trimmedPhone,
        role: effectiveRole,
        perms: effectiveRole === 'supervisor' ? perms : [],
        track: trimmedTrack,
      });
      setFeedback({ type: 'ok', text: 'تم إنشاء الحساب وحفظه في Firebase Auth وFirestore بنجاح.' });
      setName('');
      setEmail('');
      setPassword('');
      setPhone('');
      setTrack('القرآن الكريم');
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'فشل إنشاء العضو.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (member: MemberDoc) => {
    setFeedback(null);
    const nextStatus = member.status === 'active' ? 'disabled' : 'active';
    try {
      await callProtectedApi('/api/members/disable', {
        uid: member.uid,
        status: nextStatus,
      });
      setFeedback({
        type: 'ok',
        text: nextStatus === 'disabled' ? 'تم تعطيل العضو وإلغاء جلساته.' : 'تم تفعيل العضو بنجاح.',
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'تعذر تعديل حالة العضو.',
      });
    }
  };

  const handleSaveSupervisorPerms = async () => {
    if (!editingSupervisor) return;
    setFeedback(null);
    try {
      await callProtectedApi('/api/members/permissions', {
        uid: editingSupervisor.uid,
        perms: editingPerms,
      });
      setFeedback({ type: 'ok', text: 'تم تحديث صلاحيات المشرف ومزامنة Custom Claims.' });
      setEditingSupervisor(null);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'تعذر تحديث الصلاحيات.',
      });
    }
  };

  const handleLinkParent = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      await callProtectedApi('/api/parent-links/link', {
        parentUid: linkParentUid,
        studentId: linkStudentId,
        relation: linkRelation,
        action: 'link',
      });
      setFeedback({ type: 'ok', text: 'تم ربط ولي الأمر بالطالب واعتماد الوصول في Firestore.' });
      setLinkParentUid('');
      setLinkStudentId('');
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'تعذر ربط ولي الأمر.',
      });
    }
  };

  const handleRevokeParentLink = async (parentUid: string, studentId: string) => {
    setFeedback(null);
    try {
      await callProtectedApi('/api/parent-links/link', {
        parentUid,
        studentId,
        action: 'revoke',
      });
      setFeedback({ type: 'ok', text: 'تم فك ارتباط ولي الأمر بالطالب.' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'تعذر فك الارتباط.',
      });
    }
  };

  const parentMembers = data.members.filter((m) => m.role === 'parent' && m.status === 'active');

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

      {/* Create Member Form */}
      {allowedCreatableRoles.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-teal-700 dark:text-teal-400" />
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              إنشاء حساب عضو جديد عبر الخادم
            </h2>
          </div>
          <p className="mb-5 text-xs text-slate-500 dark:text-slate-400">
            لا يمكن إنشاء مدير أكاديمية عبر هذه الواجهة. تُسجّل كل عملية في سجل التدقيق غير القابل للتعديل.
          </p>

          <form onSubmit={(e) => void handleCreateMember(e)} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                الاسم الكامل
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                البريد الإلكتروني
              </label>
              <input
                type="email"
                required
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                كلمة المرور المبدئية (8+ أحرف)
              </label>
              <input
                type="password"
                required
                minLength={8}
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                الدور الوظيفي
              </label>
              <select
                value={effectiveRole || ''}
                onChange={(e) => setRole(e.target.value as AcademyRole)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                {allowedCreatableRoles.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                رقم الهاتف (اختياري)
              </label>
              <input
                type="tel"
                dir="ltr"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>

            {effectiveRole === 'student' && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  المسار التعليمي
                </label>
                <input
                  type="text"
                  value={track}
                  onChange={(e) => setTrack(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
            )}

            {effectiveRole === 'supervisor' && (
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  الصلاحيات المفوضة للمشرف:
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {ALL_SUPERVISOR_PERMISSIONS.map((perm) => (
                    <label
                      key={perm}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={perms.includes(perm)}
                        onChange={() => togglePerm(perm, perms, setPerms)}
                        className="accent-teal-700"
                      />
                      <span>{PERMISSION_LABELS[perm]}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="sm:col-span-2 lg:col-span-3">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-800 disabled:opacity-60"
              >
                {submitting ? 'جاري الإنشاء...' : 'حفظ وإنشاء العضو'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Members Table */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-4 font-display text-lg font-bold text-slate-900 dark:text-white">
          سجل الأعضاء ({data.members.length})
        </h2>

        {data.members.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">لا يوجد أعضاء مسجلون بعد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-3 pl-4 font-medium">الاسم</th>
                  <th className="py-3 px-4 font-medium">البريد</th>
                  <th className="py-3 px-4 font-medium">الدور</th>
                  <th className="py-3 px-4 font-medium">الحالة</th>
                  <th className="py-3 px-4 font-medium">التاريخ</th>
                  <th className="py-3 pr-4 font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.members.map((m) => (
                  <tr key={m.uid} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 pl-4 font-semibold text-slate-900 dark:text-slate-100">
                      {m.name}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-600 dark:text-slate-300" dir="ltr">
                      {m.email}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700 dark:text-slate-300">
                      {ROLE_LABELS[m.role]}
                      {m.role === 'supervisor' && m.perms.length > 0 && (
                        <span className="block text-[11px] text-slate-500">
                          {m.perms.map((p) => PERMISSION_LABELS[p]).join(' · ')}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <span
                        className={
                          m.status === 'active'
                            ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                            : 'font-semibold text-red-700 dark:text-red-400'
                        }
                      >
                        {m.status === 'active' ? 'نشط' : 'معطل'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500 tabular-nums">
                      {formatDateArabic(m.createdAt)}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        {actor.role === 'owner' && m.role === 'supervisor' && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSupervisor(m);
                              setEditingPerms(m.perms || []);
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                          >
                            <Shield className="h-3.5 w-3.5" />
                            <span>الصلاحيات</span>
                          </button>
                        )}
                        {m.role !== 'owner' && m.uid !== actor.uid && (
                          <button
                            type="button"
                            onClick={() => void handleToggleStatus(m)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                          >
                            {m.status === 'active' ? (
                              <>
                                <UserX className="h-3.5 w-3.5 text-red-600" />
                                <span>تعطيل</span>
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                <span>تفعيل</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Supervisor Permissions Modal */}
      {editingSupervisor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              صلاحيات المشرف: {editingSupervisor.name}
            </h3>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {ALL_SUPERVISOR_PERMISSIONS.map((perm) => (
                <label
                  key={perm}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={editingPerms.includes(perm)}
                    onChange={() => togglePerm(perm, editingPerms, setEditingPerms)}
                    className="accent-teal-700"
                  />
                  <span>{PERMISSION_LABELS[perm]}</span>
                </label>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingSupervisor(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium dark:border-slate-700"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => void handleSaveSupervisorPerms()}
                className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
              >
                حفظ الصلاحيات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Official Parent-Student Linking */}
      {(actor.role === 'owner' ||
        hasSupervisorPerm(actor, 'parents') ||
        hasSupervisorPerm(actor, 'students')) && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-2">
            <Link2 className="h-5 w-5 text-teal-700 dark:text-teal-400" />
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              ربط ولي الأمر بالطالب (معتمد إداريًا فقط)
            </h2>
          </div>

          <form onSubmit={(e) => void handleLinkParent(e)} className="grid gap-4 sm:grid-cols-4">
            <select
              required
              value={linkParentUid}
              onChange={(e) => setLinkParentUid(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="">اختر ولي الأمر...</option>
              {parentMembers.map((p) => (
                <option key={p.uid} value={p.uid}>
                  {p.name} ({p.email})
                </option>
              ))}
            </select>

            <select
              required
              value={linkStudentId}
              onChange={(e) => setLinkStudentId(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="">اختر الطالب...</option>
              {data.students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName}
                </option>
              ))}
            </select>

            <input
              type="text"
              value={linkRelation}
              onChange={(e) => setLinkRelation(e.target.value)}
              placeholder="صلة القرابة"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />

            <button
              type="submit"
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
            >
              اعتماد الربط
            </button>
          </form>

          {data.parentLinks.length > 0 && (
            <div className="mt-6 divide-y divide-slate-100 dark:divide-slate-800">
              {data.parentLinks.map((link) => (
                <div key={link.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                  <div>
                    <span className="font-semibold">{link.parentName}</span>
                    <span className="mx-2 text-slate-400">←</span>
                    <span className="font-semibold">{link.studentName}</span>
                    <span className="mr-2 text-xs text-slate-500">
                      ({link.relation} · {link.status === 'active' ? 'مرتبط' : 'ملغى'})
                    </span>
                  </div>
                  {link.status === 'active' && (
                    <button
                      type="button"
                      onClick={() => void handleRevokeParentLink(link.parentUid, link.studentId)}
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      فك الارتباط
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
