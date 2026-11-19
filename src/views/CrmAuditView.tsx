import React, { useState } from 'react';
import { ShieldCheck, TrendingUp } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import type { AcademyDataState } from '../hooks/useAcademyData';
import { callProtectedApi } from '../lib/apiClient';
import { LEAD_STAGE_LABELS, ROLE_LABELS, formatDateArabic } from '../shared/labels';
import { hasSupervisorPerm } from '../shared/policy';

export function CrmAuditView({ data }: { data: AcademyDataState }) {
  const { actor } = useAuth();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [interestTrack, setInterestTrack] = useState('حفظ القرآن الكريم');
  const [source, setSource] = useState('إعلان / تواصل مباشر');
  const [stage, setStage] = useState<'new' | 'contacted' | 'trial' | 'enrolled' | 'lost'>('new');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  if (!actor) return null;

  const canCrm = actor.role === 'owner' || hasSupervisorPerm(actor, 'crm');

  const handleSaveLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      await callProtectedApi('/api/crm/lead', {
        fullName,
        phone,
        interestTrack,
        source,
        stage,
      });
      setFeedback({ type: 'ok', text: 'تم حفظ طلب التسجيل في CRM.' });
      setFullName('');
      setPhone('');
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'تعذر حفظ الطلب.' });
    }
  };

  const handleStageUpdate = async (id: string, leadName: string, leadPhone: string, nextStage: string) => {
    setFeedback(null);
    try {
      await callProtectedApi('/api/crm/lead', {
        id,
        fullName: leadName,
        phone: leadPhone,
        stage: nextStage,
      });
      setFeedback({ type: 'ok', text: 'تم تحديث مرحلة العميل المحتمل.' });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'تعذر التحديث.' });
    }
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

      {canCrm && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-teal-700 dark:text-teal-400" />
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              إدارة طلبات التسجيل الجديدة (CRM)
            </h2>
          </div>

          <form onSubmit={(e) => void handleSaveLead(e)} className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="الاسم"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
            <input
              type="tel"
              required
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="رقم الهاتف"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
            <input
              type="text"
              value={interestTrack}
              onChange={(e) => setInterestTrack(e.target.value)}
              placeholder="المسار المطلوب"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value as typeof stage)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            >
              {Object.entries(LEAD_STAGE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
            >
              إضافة متقدم
            </button>
          </form>

          {data.leads.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">لا توجد طلبات مسجلة في CRM.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.leads.map((lead) => (
                <div key={lead.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <div>
                    <p className="font-semibold">{lead.fullName}</p>
                    <p className="text-xs text-slate-500">
                      <span dir="ltr" className="font-mono">{lead.phone}</span> · {lead.interestTrack}
                    </p>
                  </div>
                  <select
                    value={lead.stage}
                    onChange={(e) =>
                      void handleStageUpdate(lead.id, lead.fullName, lead.phone, e.target.value)
                    }
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                  >
                    {Object.entries(LEAD_STAGE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Owner-only Immutable Audit Logs */}
      {actor.role === 'owner' && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-teal-700 dark:text-teal-400" />
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              سجل التدقيق الأمني (Audit Logs — غير قابل للتعديل)
            </h2>
          </div>

          {data.auditLogs.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">لا توجد أحداث مسجلة بعد.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800">
                    <th className="py-2.5 pl-3">العملية</th>
                    <th className="py-2.5 px-3">المنفّذ</th>
                    <th className="py-2.5 px-3">الدور</th>
                    <th className="py-2.5 px-3">الهدف</th>
                    <th className="py-2.5 pr-3">التوقيت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="py-2.5 pl-3 font-mono font-semibold text-teal-700 dark:text-teal-400">
                        {log.action}
                      </td>
                      <td className="py-2.5 px-3 font-mono" dir="ltr">
                        {log.actorEmail}
                      </td>
                      <td className="py-2.5 px-3">{ROLE_LABELS[log.actorRole] || log.actorRole}</td>
                      <td className="py-2.5 px-3 font-mono">
                        {log.targetCollection}/{log.targetId}
                      </td>
                      <td className="py-2.5 pr-3 tabular-nums text-slate-500">
                        {formatDateArabic(log.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
