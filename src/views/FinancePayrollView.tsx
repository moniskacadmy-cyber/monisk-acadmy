import React, { useState } from 'react';
import { Banknote, CreditCard, Receipt } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import type { AcademyDataState } from '../hooks/useAcademyData';
import { callProtectedApi } from '../lib/apiClient';
import {
  INVOICE_STATUS_LABELS,
  ROLE_LABELS,
  formatCurrency,
  formatDateArabic,
} from '../shared/labels';
import { hasSupervisorPerm } from '../shared/policy';

export function FinancePayrollView({ data }: { data: AcademyDataState }) {
  const { actor, academy } = useAuth();
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Invoice Form
  const [invStudentId, setInvStudentId] = useState('');
  const [invTitle, setInvTitle] = useState('رسوم الاشتراك الشهري');
  const [invAmount, setInvAmount] = useState(300);
  const [invDueDate, setInvDueDate] = useState(new Date().toISOString().slice(0, 10));

  // Payment Form
  const [payInvoiceId, setPayInvoiceId] = useState('');
  const [payAmount, setPayAmount] = useState(300);
  const [payMethod, setPayMethod] = useState<'cash' | 'bank_transfer' | 'card' | 'online'>('bank_transfer');

  // Payroll Form
  const [payMemberUid, setPayMemberUid] = useState('');
  const [periodMonth, setPeriodMonth] = useState(new Date().toISOString().slice(0, 7));
  const [baseAmount, setBaseAmount] = useState(2500);
  const [bonusAmount, setBonusAmount] = useState(0);
  const [deductionAmount, setDeductionAmount] = useState(0);

  if (!actor) return null;

  const canFinance = actor.role === 'owner' || hasSupervisorPerm(actor, 'finance');
  const canPayroll = actor.role === 'owner' || hasSupervisorPerm(actor, 'payroll');
  const currency = academy?.currency || 'SAR';

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      await callProtectedApi('/api/finance/invoice', {
        studentId: invStudentId,
        title: invTitle,
        amount: invAmount,
        currency,
        dueDate: invDueDate,
      });
      setFeedback({ type: 'ok', text: 'تم إصدار الفاتورة وحفظها في Firestore.' });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'تعذر إصدار الفاتورة.' });
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      await callProtectedApi('/api/finance/payment', {
        invoiceId: payInvoiceId,
        amount: payAmount,
        method: payMethod,
      });
      setFeedback({ type: 'ok', text: 'تم تسجيل الدفعة وتحديث حالة الفاتورة.' });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'تعذر تسجيل الدفعة.' });
    }
  };

  const handleCreatePayroll = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      await callProtectedApi('/api/finance/payroll', {
        memberUid: payMemberUid,
        periodMonth,
        baseAmount,
        bonusAmount,
        deductionAmount,
        currency,
        status: 'approved',
      });
      setFeedback({ type: 'ok', text: 'تم اعتماد كشف الراتب وحفظه في سجل الرواتب.' });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'تعذر حفظ الراتب.' });
    }
  };

  const staffMembers = data.members.filter((m) =>
    ['supervisor', 'teacher'].includes(m.role)
  );

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

      {/* Invoices Creation & Payments (Finance only) */}
      {canFinance && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex items-center gap-2">
              <Receipt className="h-5 w-5 text-teal-700 dark:text-teal-400" />
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                إصدار فاتورة طالب
              </h2>
            </div>
            <form onSubmit={(e) => void handleCreateInvoice(e)} className="space-y-3">
              <select
                required
                value={invStudentId}
                onChange={(e) => setInvStudentId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
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
                required
                value={invTitle}
                onChange={(e) => setInvTitle(e.target.value)}
                placeholder="بيان الفاتورة"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  required
                  min={1}
                  value={invAmount}
                  onChange={(e) => setInvAmount(Number(e.target.value))}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums dark:border-slate-700 dark:bg-slate-950"
                />
                <input
                  type="date"
                  dir="ltr"
                  value={invDueDate}
                  onChange={(e) => setInvDueDate(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <button
                type="submit"
                className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
              >
                إصدار الفاتورة
              </button>
            </form>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-teal-700 dark:text-teal-400" />
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                تسجيل دفعة مالية
              </h2>
            </div>
            <form onSubmit={(e) => void handleRecordPayment(e)} className="space-y-3">
              <select
                required
                value={payInvoiceId}
                onChange={(e) => setPayInvoiceId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="">اختر الفاتورة...</option>
                {data.invoices
                  .filter((i) => i.status !== 'paid' && i.status !== 'cancelled')
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.studentName} — {i.title} (المتبقي {i.amount - i.paidAmount} {i.currency})
                    </option>
                  ))}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  required
                  min={1}
                  value={payAmount}
                  onChange={(e) => setPayAmount(Number(e.target.value))}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums dark:border-slate-700 dark:bg-slate-950"
                />
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as 'cash' | 'bank_transfer' | 'card' | 'online')}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="bank_transfer">تحويل بنكي</option>
                  <option value="cash">نقدًا</option>
                  <option value="card">بطاقة</option>
                  <option value="online">دفع إلكتروني</option>
                </select>
              </div>
              <button
                type="submit"
                className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
              >
                تأكيد السداد
              </button>
            </form>
          </section>
        </div>
      )}

      {/* Invoices List (Visible to Finance OR Parent for own children) */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-4 font-display text-lg font-bold text-slate-900 dark:text-white">
          الفواتير ({data.invoices.length})
        </h2>
        {data.invoices.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">لا توجد فواتير مسجلة.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800">
                  <th className="py-2.5 pl-4">الطالب</th>
                  <th className="py-2.5 px-4">البيان</th>
                  <th className="py-2.5 px-4">الإجمالي</th>
                  <th className="py-2.5 px-4">المدفوع</th>
                  <th className="py-2.5 px-4">الاستحقاق</th>
                  <th className="py-2.5 pr-4">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="py-3 pl-4 font-semibold">{inv.studentName}</td>
                    <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">{inv.title}</td>
                    <td className="py-3 px-4 font-mono tabular-nums">{formatCurrency(inv.amount, inv.currency)}</td>
                    <td className="py-3 px-4 font-mono tabular-nums">{formatCurrency(inv.paidAmount, inv.currency)}</td>
                    <td className="py-3 px-4 text-xs tabular-nums">{formatDateArabic(inv.dueDate)}</td>
                    <td className="py-3 pr-4 text-xs font-semibold">
                      {INVOICE_STATUS_LABELS[inv.status] || inv.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Payroll Section (Owner or Payroll Supervisor ONLY) */}
      {canPayroll && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-2">
            <Banknote className="h-5 w-5 text-teal-700 dark:text-teal-400" />
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              إدارة الرواتب (صلاحية حصرية)
            </h2>
          </div>

          <form onSubmit={(e) => void handleCreatePayroll(e)} className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <select
              required
              value={payMemberUid}
              onChange={(e) => setPayMemberUid(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="">اختر الموظف / المعلم...</option>
              {staffMembers.map((m) => (
                <option key={m.uid} value={m.uid}>
                  {m.name} ({ROLE_LABELS[m.role]})
                </option>
              ))}
            </select>
            <input
              type="month"
              dir="ltr"
              value={periodMonth}
              onChange={(e) => setPeriodMonth(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums dark:border-slate-700 dark:bg-slate-950"
            />
            <input
              type="number"
              min={0}
              value={baseAmount}
              onChange={(e) => setBaseAmount(Number(e.target.value))}
              placeholder="الراتب الأساسي"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums dark:border-slate-700 dark:bg-slate-950"
            />
            <input
              type="number"
              min={0}
              value={bonusAmount}
              onChange={(e) => setBonusAmount(Number(e.target.value))}
              placeholder="مكافأة"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums dark:border-slate-700 dark:bg-slate-950"
            />
            <input
              type="number"
              min={0}
              value={deductionAmount}
              onChange={(e) => setDeductionAmount(Number(e.target.value))}
              placeholder="خصم"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums dark:border-slate-700 dark:bg-slate-950"
            />
            <button
              type="submit"
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
            >
              اعتماد الراتب
            </button>
          </form>

          {data.payroll.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">لا توجد مسيرات رواتب مسجلة.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.payroll.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <p className="font-semibold">{p.memberName}</p>
                    <p className="text-xs text-slate-500 tabular-nums">
                      {ROLE_LABELS[p.role]} · شهر {p.periodMonth}
                    </p>
                  </div>
                  <p className="font-mono font-bold text-teal-700 tabular-nums dark:text-teal-400">
                    {formatCurrency(p.netAmount, p.currency)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
